import { Request, Response } from 'express';
import { query } from '../lib/postgres.ts';
import { payHero } from '../services/payhero.ts';
import { paystack } from '../services/paystack.ts';

/**
 * Payment Controller - PostgreSQL Implementation (v4)
 * Redesigned for cleaner transaction lifecycle management built on native SQL.
 */

export class PaymentController {
  
  /**
   * Primary Entry Point: Initiate STK Push
   */
  static async stkPush(req: Request, res: Response) {
    const { phoneNumber, amount, userId, description, reference } = req.body;

    if (!phoneNumber || !amount) {
      return res.status(400).json({ success: false, error: 'phoneNumber and amount are mandatory' });
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const dynamicCallbackUrl = `${protocol}://${host}/api/payments/callback`;
    
    let callbackUrl = dynamicCallbackUrl;
    if (process.env.CALLBACK_URL && !process.env.CALLBACK_URL.includes('action-backend-api-') && !process.env.CALLBACK_URL.includes('798918228047')) {
      callbackUrl = process.env.CALLBACK_URL;
    }

    // Generate unique idempotency key / business reference or use provided one
    const internalRef = reference || `TX${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    try {
      // 1. Ensure profile exists to satisfy foreign key requirement safely
      if (userId) {
        await query(`
          INSERT INTO profiles (id, balance, name)
          VALUES ($1, 0.00, 'User')
          ON CONFLICT (id) DO NOTHING
        `, [userId]);
      }

      // 2. Log to Database (Audit Trail)
      const insertRes = await query(`
        INSERT INTO transactions (user_id, phone_number, amount, reference, status, description, created_at)
        VALUES ($1, $2, $3, $4, 'PENDING', $5, CURRENT_TIMESTAMP)
        RETURNING *
      `, [userId || null, phoneNumber, Number(amount), internalRef, description || 'Payment Service']);

      const txRecord = insertRes.rows[0];

      // 3. Execute external API call
      const providerResponse = await payHero.initiateSTKPush({
        phone: phoneNumber,
        amount: Number(amount),
        reference: internalRef,
        description: description,
        callbackUrl: callbackUrl
      });

      console.log(`[STK-Push] Dispatched with Callback: ${callbackUrl}`);

      // 4. Update record with primary provider response (Initial log)
      await query(`
        UPDATE transactions
        SET checkout_request_id = $1, is_closed = false
        WHERE reference = $2
      `, [providerResponse.CheckoutRequestID || providerResponse.checkout_request_id || null, internalRef]);

      // 5. Response to Client
      return res.status(200).json({
        success: true,
        message: 'STK push initiated',
        reference: internalRef,
        transactionId: txRecord.id,
        providerResponse
      });

    } catch (error: any) {
      const detailedError = error.message.includes('[Channel') 
        ? error.message 
        : `[System] ${error.message}`;

      console.error(`[PaymentController] Process failed for ref ${internalRef}:`, detailedError);
      
      // Update DB to register failure with specific details
      await query(`
        UPDATE transactions
        SET status = 'FAILED', is_closed = true, description = $1, closed_at = CURRENT_TIMESTAMP
        WHERE reference = $2
      `, [`Transaction Failed: ${detailedError}`, internalRef]);

      return res.status(500).json({
        success: false,
        error: detailedError,
        channel: detailedError.match(/\[Channel (\d+)\]/)?.[1] || '6789'
      });
    }
  }

  /**
   * Paystack STK Push: Direct Mobile Money Charge
   */
  static async stkPushPaystack(req: Request, res: Response) {
    const { email, amount, phone, userId, description, txId } = req.body;

    if (!email || !amount || !phone) {
      return res.status(400).json({ success: false, error: 'email, amount, and phone are mandatory' });
    }

    // Normalize phone number to +254... format (E.164)
    let cleanPhone = phone.replace(/\D/g, '');
    
    // Convert various formats to 2547XXXXXXXX or 2541XXXXXXXX
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '254' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('2540')) {
      cleanPhone = '254' + cleanPhone.substring(4);
    } else if (cleanPhone.length === 9) {
      if (cleanPhone.startsWith('7') || cleanPhone.startsWith('1')) {
        cleanPhone = '254' + cleanPhone;
      }
    }

    const formattedPhone = '+' + cleanPhone;

    // Strict validation for Kenyan numbers (starting with +2547 or +2541)
    if (!/^\+254[17]\d{8}$/.test(formattedPhone)) {
      return res.status(400).json({ success: false, error: 'Invalid Kenyan phone number format. Please use 07XXXXXXXX or 2547XXXXXXXX.' });
    }

    // Use txId as reference if provided, otherwise generate a new one
    const internalRef = txId || `PSS${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    try {
      // 1. Ensure record exists or create it
      let currentTxId = txId;

      if (!txId) {
        if (userId) {
          await query(`
            INSERT INTO profiles (id, balance, name)
            VALUES ($1, 0.00, 'User')
            ON CONFLICT (id) DO NOTHING
          `, [userId]);
        }

        const insertRes = await query(`
          INSERT INTO transactions (user_id, amount, reference, status, description, provider, phone_number, created_at)
          VALUES ($1, $2, $3, 'PENDING', $4, 'paystack', $5, CURRENT_TIMESTAMP)
          RETURNING id
        `, [userId || null, Number(amount), internalRef, description || 'Paystack STK Push', formattedPhone]);

        currentTxId = insertRes.rows[0].id;
      } else {
        // If txId is provided, ensure reference matches in DB
        await query(`
          UPDATE transactions
          SET reference = $1, phone_number = $2, provider = 'paystack'
          WHERE id = $3
        `, [internalRef, formattedPhone, txId]);
      }

      // 2. Charge Paystack
      const chargeResponse = await paystack.chargeMobileMoney({
        email,
        amount: Number(amount),
        phone: formattedPhone,
        reference: internalRef
      });

      // Handle standard and direct charge responses
      const status = chargeResponse.status;
      const displayMessage = chargeResponse.display_text || 'Please check your phone for the M-Pesa PIN prompt.';
      
      console.log(`[PaymentController] Paystack Response - Status: ${status} | Ref: ${internalRef}`);

      // 3. Update with provider reference
      const isPaystackCompleted = (status === 'success' || status === 'successful');
      await query(`
        UPDATE transactions
        SET checkout_request_id = $1,
            status = $2,
            is_closed = $3,
            closed_at = CASE WHEN $3 = true THEN CURRENT_TIMESTAMP ELSE closed_at END
        WHERE id = $4
      `, [
        chargeResponse.reference || internalRef, 
        isPaystackCompleted ? 'COMPLETED' : 'PENDING',
        isPaystackCompleted,
        currentTxId
      ]);

      if (isPaystackCompleted && userId && amount) {
        await query(`
          UPDATE profiles
          SET balance = balance + $1
          WHERE id = $2
        `, [Number(amount), userId]);
        console.log(`[stkPushPaystack] Direct completion credited user: ${userId} with ${amount}`);
      }

      return res.status(200).json({
        success: true,
        reference: internalRef,
        status: status,
        message: displayMessage,
        instruction: status === 'pending' || status === 'send_otp' ? 'Enter your M-Pesa PIN on your phone to complete the payment.' : null,
        txId: currentTxId
      });

    } catch (error: any) {
      console.error(`[PaymentController] Paystack STK Push failed:`, error.message);
      
      // Attempt to mark as failed if we have an ID
      if (txId) {
        await query(`
          UPDATE transactions
          SET status = 'FAILED', is_closed = true, description = $1, closed_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [`Paystack failed: ${error.message}`, txId]);
      }

      return res.status(200).json({ success: false, error: error.message });
    }
  }

  /**
   * Paystack Entry Point: Initialize Transaction (Redirection)
   */
  static async initializePaystack(req: Request, res: Response) {
    const { email, amount, userId, description, txId } = req.body;

    if (!email || !amount) {
      return res.status(400).json({ success: false, error: 'email and amount are mandatory' });
    }

    const internalRef = txId || `PST${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    try {
      let currentTxId = txId;

      if (!txId) {
        if (userId) {
          await query(`
            INSERT INTO profiles (id, balance, name)
            VALUES ($1, 0.00, 'User')
            ON CONFLICT (id) DO NOTHING
          `, [userId]);
        }

        const insertRes = await query(`
          INSERT INTO transactions (user_id, amount, reference, status, description, provider, created_at)
          VALUES ($1, $2, $3, 'PENDING', $4, 'paystack', CURRENT_TIMESTAMP)
          RETURNING id
        `, [userId || null, Number(amount), internalRef, description || 'Paystack Payment']);

        currentTxId = insertRes.rows[0].id;
      } else {
        await query(`
          UPDATE transactions
          SET reference = $1, provider = 'paystack'
          WHERE id = $2
        `, [internalRef, txId]);
      }

      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.get('host');
      const dynamicPaystackCallbackUrl = `${protocol}://${host}/api/payments/paystack/callback`;
      
      let paystackCallbackUrl = dynamicPaystackCallbackUrl;
      if (process.env.PAYSTACK_CALLBACK_URL && !process.env.PAYSTACK_CALLBACK_URL.includes('action-backend-api-') && !process.env.PAYSTACK_CALLBACK_URL.includes('798918228047')) {
        paystackCallbackUrl = process.env.PAYSTACK_CALLBACK_URL;
      } else if (process.env.APP_URL && !process.env.APP_URL.includes('action-backend-api-') && !process.env.APP_URL.includes('798918228047')) {
        paystackCallbackUrl = `${process.env.APP_URL}/api/payments/paystack/callback`;
      }

      // 2. Initialize Paystack
      const paystackResponse = await paystack.initializeTransaction({
        email,
        amount: Number(amount),
        reference: internalRef,
        callbackUrl: paystackCallbackUrl
      });

      // Update with access code
      await query(`
        UPDATE transactions
        SET checkout_request_id = $1
        WHERE id = $2
      `, [paystackResponse.access_code, currentTxId]);

      return res.status(200).json({
        success: true,
        reference: internalRef,
        authorization_url: paystackResponse.authorization_url,
        access_code: paystackResponse.access_code,
        transactionId: currentTxId
      });

    } catch (error: any) {
      console.error(`[PaymentController] Paystack Init failed:`, error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Paystack Webhook
   */
  static async paystackWebhook(req: Request, res: Response) {
    const event = req.body;
    console.log('[Webhook] Paystack event received:', event?.event);

    if (event?.event === 'charge.success') {
      const data = event.data;
      const reference = data.reference;
      
      try {
        const updateRes = await query(`
          UPDATE transactions
          SET status = 'COMPLETED', is_closed = true, closed_at = CURRENT_TIMESTAMP
          WHERE reference = $1
          RETURNING user_id, amount
        `, [reference]);

        if (updateRes.rows.length === 0) {
          console.warn(`[Paystack-Webhook] Reference ${reference} not found in database.`);
          return res.status(200).send('Transaction reference not found');
        }

        const tx = updateRes.rows[0];
        if (tx.user_id && tx.amount) {
          await query(`
            UPDATE profiles 
            SET balance = balance + $1 
            WHERE id = $2
          `, [Number(tx.amount), tx.user_id]);
          console.log(`[Paystack-Webhook] Credited user: ${tx.user_id} with: ${tx.amount}`);
        }

        return res.status(200).send('Webhook Received');
      } catch (err: any) {
        console.error('[Paystack-Webhook] Error:', err.message);
        return res.status(500).send('Error updating transaction');
      }
    }

    return res.status(200).send('Event ignored');
  }

  /**
   * Webhook: Handle PayHero Callbacks
   * Endpoint: POST /api/payments/callback
   */
  static async callback(req: Request, res: Response) {
    console.log('[Webhook] PayHero callback request body:', JSON.stringify(req.body, null, 2));
    
    const payload = req.body;
    try {
      const data = payload.response || payload;
      
      const status = data.Status || data.status;
      const resultCode = data.ResultCode !== undefined ? Number(data.ResultCode) : (data.result_code !== undefined ? Number(data.result_code) : null);
      const checkoutRequestId = data.CheckoutRequestID || data.checkout_request_id;
      
      let externalReference = (
        data.ExternalReference || 
        data.external_reference || 
        data.reference || 
        data.Reference || 
        data.BillRefNumber || 
        data.AccountID || 
        ''
      ).toString().trim();
      
      const mpesaReceiptNumber = data.MpesaReceiptNumber || data.mpesa_receipt_number;
      const resultDesc = data.ResultDesc || data.result_desc || status || 'No description provided';

      if (!externalReference) {
        console.warn('[Webhook] Missing Reference in payload keys.');
        return res.status(200).json({ success: false, error: 'Missing Reference' }); 
      }

      // Determine Final Status
      const normalizedStatus = (status || '').toLowerCase();
      const isSuccessful = 
        normalizedStatus === 'success' || 
        normalizedStatus === 'successful' ||
        normalizedStatus === 'ok' ||
        resultCode === 0 ||
        data.Success === true ||
        data.Success === 'true' ||
        data.success === true ||
        (data.ResponseMessage || '').toLowerCase() === 'success' ||
        (data.response_message || '').toLowerCase() === 'success';
      
      const isFailed = 
        normalizedStatus === 'cancelled' || 
        normalizedStatus === 'failed' || 
        (resultCode !== null && resultCode !== 0) ||
        data.Success === false ||
        data.Success === 'false' ||
        data.success === false;

      let finalStatus: 'COMPLETED' | 'FAILED' | 'PENDING' = 'PENDING';
      if (isSuccessful) finalStatus = 'COMPLETED';
      else if (isFailed) finalStatus = 'FAILED';

      console.log(`[Webhook] Ref: ${externalReference} | RawStatus: ${status} | Result: ${finalStatus} | Receipt: ${mpesaReceiptNumber || 'N/A'}`);

      // Fetch transaction from database safely
      const existingRes = await query(`
        SELECT status, is_closed, user_id, amount FROM transactions
        WHERE LOWER(reference) = LOWER($1)
        LIMIT 1
      `, [externalReference]);

      const existingTx = existingRes.rows[0];

      if (!existingTx) {
        console.error(`[Webhook] Ref: ${externalReference} not found in DB.`);
        return res.status(200).json({ success: false, error: `Reference ${externalReference} not found in database.` });
      }

      if (existingTx.is_closed) {
        console.log(`[Webhook] Ref: ${externalReference} already closed. Skipping.`);
        return res.status(200).json({ success: false, error: `Transaction ${externalReference} is already closed.` });
      }

      // Update the record in PostgreSQL
      await query(`
        UPDATE transactions
        SET status = $1,
            is_closed = true,
            description = $2,
            checkout_request_id = COALESCE($3, checkout_request_id),
            closed_at = CURRENT_TIMESTAMP
        WHERE LOWER(reference) = LOWER($4)
      `, [finalStatus, resultDesc, checkoutRequestId || null, externalReference]);

      // If transition completed successfully, top up the user's balance!
      if (finalStatus === 'COMPLETED' && existingTx.user_id && existingTx.amount) {
        await query(`
          UPDATE profiles
          SET balance = balance + $1
          WHERE id = $2
        `, [Number(existingTx.amount), existingTx.user_id]);
        console.log(`[Webhook] Credited user account: ${existingTx.user_id} with KES ${existingTx.amount}`);
      }

      return res.status(200).json({ success: true, message: 'Callback processed successfully' });
    } catch (err: any) {
      console.error('[Webhook] Critical failure:', err.message);
      return res.status(200).json({ success: false, error: 'Critical failure processing callback', details: err.message }); 
    }
  }

  /**
   * Maintenance: Mark stale PENDING transactions as FAILED
   */
  static async cleanupStale(req: Request, res: Response) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    try {
      const cleanupRes = await query(`
        UPDATE transactions
        SET status = 'FAILED', 
            is_closed = true,
            description = 'Transaction timed out (No response from provider within window).',
            closed_at = CURRENT_TIMESTAMP
        WHERE status = 'PENDING' AND is_closed = false AND created_at < $1
        RETURNING *
      `, [fiveMinutesAgo]);

      const cleanedRows = cleanupRes.rows;

      return res.status(200).json({ 
        success: true, 
        cleaned: cleanedRows.length,
        message: `${cleanedRows.length} stale transactions marked as FAILED.`
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Debug: Check if the backend can see a specific transaction
   */
  static async debugTransaction(req: Request, res: Response) {
    const { reference } = req.params;
    try {
      const debugRes = await query(`
        SELECT * FROM transactions
        WHERE LOWER(reference) = LOWER($1)
        LIMIT 1
      `, [reference]);

      const data = debugRes.rows[0];

      return res.json({
        exists: !!data,
        status: data?.status,
        is_closed: data?.is_closed,
        db_type: 'PostgreSQL - Local (errandly)',
        data
      });
    } catch (err: any) {
      return res.status(404).json({ exists: false, error: err.message });
    }
  }

  /**
   * Utility: Manually Check Transaction Status
   */
  static async checkStatus(req: Request, res: Response) {
    const { reference } = req.query;

    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ error: 'Valid transaction reference required' });
    }

    try {
      const txRes = await query(`
        SELECT checkout_request_id, provider, user_id, amount, status FROM transactions
        WHERE LOWER(reference) = LOWER($1)
        LIMIT 1
      `, [reference]);

      const tx = txRes.rows[0];

      if (tx?.provider === 'paystack') {
        const result = await paystack.verifyTransaction(reference);
        const mappedStatus = result.status === 'success' ? 'COMPLETED' : 
                            (result.status === 'failed' || result.status === 'abandoned') ? 'FAILED' : 'PENDING';
        
        await query(`
          UPDATE transactions
          SET status = $1,
              is_closed = $2,
              closed_at = CASE WHEN $2 = true THEN CURRENT_TIMESTAMP ELSE closed_at END
          WHERE LOWER(reference) = LOWER($3)
        `, [mappedStatus, mappedStatus === 'COMPLETED' || mappedStatus === 'FAILED', reference]);

        if (tx && mappedStatus === 'COMPLETED' && tx.status !== 'COMPLETED' && tx.user_id && tx.amount) {
          await query(`
            UPDATE profiles 
            SET balance = balance + $1 
            WHERE id = $2
          `, [Number(tx.amount), tx.user_id]);
          console.log(`[Status check] Verified successful Paystack payment. Credited ${tx.user_id} with ${tx.amount}`);
        }

        return res.status(200).json(result);
      }

      const rawResult = await payHero.queryStatus(reference, tx?.checkout_request_id);
      const result = rawResult.response || rawResult;
      
      const rawStatus = (result.Status || result.status || '').toString().toLowerCase();
      const resultCode = result.ResultCode !== undefined ? Number(result.ResultCode) : (result.result_code !== undefined ? Number(result.result_code) : null);
      
      const isSuccessful = 
        rawStatus === 'success' || 
        rawStatus === 'successful' ||
        rawStatus === 'ok' ||
        resultCode === 0 ||
        result.Success === true ||
        result.Success === 'true' ||
        result.success === true ||
        (result.ResponseMessage || '').toLowerCase() === 'success' ||
        (result.response_message || '').toLowerCase() === 'success';

      const isFailed = 
        rawStatus === 'cancelled' || 
        rawStatus === 'failed' || 
        (resultCode !== null && resultCode !== 0) ||
        result.Success === false ||
        result.Success === 'false' ||
        result.success === false;

      const mappedStatus = isSuccessful ? 'COMPLETED' : (isFailed ? 'FAILED' : 'PENDING');
      const isTerminal = isSuccessful || isFailed;
      
      await query(`
        UPDATE transactions
        SET status = $1,
            is_closed = $2,
            closed_at = CASE WHEN $2 = true THEN CURRENT_TIMESTAMP ELSE closed_at END
        WHERE LOWER(reference) = LOWER($3)
      `, [mappedStatus, isTerminal, reference]);

      if (tx && mappedStatus === 'COMPLETED' && tx.status !== 'COMPLETED' && tx.user_id && tx.amount) {
        await query(`
          UPDATE profiles 
          SET balance = balance + $1 
          WHERE id = $2
        `, [Number(tx.amount), tx.user_id]);
        console.log(`[Status check] Verified successful PayHero payment. Credited ${tx.user_id} with ${tx.amount}`);
      }

      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * Dedicated verifyStatus for Action Server specifications (POST/GET /api/payments/verify-status)
   */
  static async verifyStatus(req: Request, res: Response) {
    const raw = { ...req.query, ...req.body, ...req.params };
    const reference = raw.reference || raw.txId || raw.tx_ref || raw.ref;

    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid transaction reference required in request body or query.' });
    }

    try {
      // 1. Query database for local transaction
      const txRes = await query(`
        SELECT * FROM transactions
        WHERE LOWER(reference) = LOWER($1)
        LIMIT 1
      `, [reference]);

      const tx = txRes.rows[0];

      if (!tx) {
        return res.status(404).json({
          success: false,
          status: 'NOT_FOUND',
          reference,
          error: `Transaction reference '${reference}' not found.`
        });
      }

      // If already terminal in DB, return immediately
      if (tx.is_closed || tx.status === 'COMPLETED' || tx.status === 'FAILED') {
        return res.status(200).json({
          success: true,
          status: tx.status,
          reference: tx.reference,
          amount: tx.amount,
          phone_number: tx.phone_number,
          provider: tx.provider,
          description: tx.description,
          is_closed: tx.is_closed,
          created_at: tx.created_at,
          transaction: tx
        });
      }

      // 2. If PENDING, perform active provider reconciliation
      if (tx.provider === 'paystack') {
        try {
          const result = await paystack.verifyTransaction(reference);
          const mappedStatus = result.status === 'success' ? 'COMPLETED' : 
                              (result.status === 'failed' || result.status === 'abandoned') ? 'FAILED' : 'PENDING';

          const isTerminal = mappedStatus === 'COMPLETED' || mappedStatus === 'FAILED';
          await query(`
            UPDATE transactions
            SET status = $1,
                is_closed = $2,
                closed_at = CASE WHEN $2 = true THEN CURRENT_TIMESTAMP ELSE closed_at END
            WHERE LOWER(reference) = LOWER($3)
          `, [mappedStatus, isTerminal, reference]);

          if (mappedStatus === 'COMPLETED' && tx.user_id && tx.amount) {
            await query(`
              UPDATE profiles 
              SET balance = balance + $1 
              WHERE id = $2
            `, [Number(tx.amount), tx.user_id]);
          }

          return res.status(200).json({
            success: true,
            status: mappedStatus,
            reference: tx.reference,
            amount: tx.amount,
            provider: 'paystack',
            providerData: result,
            transaction: { ...tx, status: mappedStatus, is_closed: isTerminal }
          });
        } catch (err: any) {
          console.warn('[verifyStatus] Paystack verify error:', err.message);
        }
      } else {
        // PayHero / M-Pesa
        try {
          const rawResult = await payHero.queryStatus(reference, tx.checkout_request_id);
          const result = rawResult.response || rawResult;
          const rawStatus = (result.Status || result.status || '').toString().toLowerCase();
          const resultCode = result.ResultCode !== undefined ? Number(result.ResultCode) : null;
          
          const isSuccessful = rawStatus === 'success' || rawStatus === 'successful' || rawStatus === 'ok' || resultCode === 0;
          const isFailed = rawStatus === 'cancelled' || rawStatus === 'failed' || (resultCode !== null && resultCode !== 0);
          const mappedStatus = isSuccessful ? 'COMPLETED' : (isFailed ? 'FAILED' : 'PENDING');
          const isTerminal = isSuccessful || isFailed;

          if (isTerminal) {
            await query(`
              UPDATE transactions
              SET status = $1,
                  is_closed = $2,
                  closed_at = CASE WHEN $2 = true THEN CURRENT_TIMESTAMP ELSE closed_at END
              WHERE LOWER(reference) = LOWER($3)
            `, [mappedStatus, isTerminal, reference]);

            if (mappedStatus === 'COMPLETED' && tx.user_id && tx.amount) {
              await query(`
                UPDATE profiles 
                SET balance = balance + $1 
                WHERE id = $2
              `, [Number(tx.amount), tx.user_id]);
            }
          }

          return res.status(200).json({
            success: true,
            status: mappedStatus,
            reference: tx.reference,
            amount: tx.amount,
            provider: 'payhero',
            providerData: result,
            transaction: { ...tx, status: mappedStatus, is_closed: isTerminal }
          });
        } catch (err: any) {
          console.warn('[verifyStatus] PayHero query error:', err.message);
        }
      }

      // Return current status
      return res.status(200).json({
        success: true,
        status: tx.status,
        reference: tx.reference,
        amount: tx.amount,
        transaction: tx
      });
    } catch (error: any) {
      console.error('[verifyStatus] Error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}
