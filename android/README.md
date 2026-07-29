# Android Integration Guide

This directory provides complete documentation and boilerplate source code to connect your Native Android application (using Kotlin + Retrofit/OkHttp) to the **Errandly Full-stack Gateway Engine**.

## 🌐 Server Connection Coordinates

For local testing, the backend server runs on port **`3000`**.
- **Local Development URL**: Use the local loopback Address `http://127.0.0.1:3000/` when testing local integration.
- **Production Server Base URL**: Use your deployed Cloud Run URL:
  `https://ais-pre-sfwiwu2qvvdcyzjabft4um-22650132817.europe-west1.run.app/`

All endpoints are configured with a `/api` route prefix.

---

## 📡 API Core Routes Registry

Here is the exact mapping of all server endpoints, payload formats, and header requirements.

### 1. Verification & Security (SMS & Email OTP Codes)

The gateway uses a centralized PostgreSQL database table (`otp_codes`) to securely persist and check both phone and email one-time passwords, preventing high-latency remote database sync checks.

#### **Send SMS OTP**
* `POST /api/notifications/send-otp`
* **Request Payload**:
  ```json
  {
    "phoneNumber": "254712345678"
  }
  ```
* **Response**:
  ```json
  {
    "message": "OTP sent successfully"
  }
  ```

#### **Verify SMS OTP**
* `POST /api/notifications/verify-otp`
* **Request Payload**:
  ```json
  {
    "phoneNumber": "254712345678",
    "code": "123456"
  }
  ```
* **Response**:
  ```json
  {
    "message": "OTP verified successfully",
    "verified": true
  }
  ```

#### **Send Verification/Transactional Email**
* `POST /api/notifications/send-email`
* **Request Payload**:
  * Pass type `"otp"` or `"verification"` to automatically issue a 6-digit verification code and save it to the local PostgreSQL database room table.
  ```json
  {
    "to": "user@example.com",
    "type": "verification",
    "reference": "128473",
    "amount": 0
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "message": "Transactional email sent."
  }
  ```

#### **Verify Email Code**
* `POST /api/notifications/verify-email`
* **Request Payload**:
  ```json
  {
    "email": "user@example.com",
    "code": "128473"
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "message": "Email code verified successfully",
    "verified": true
  }
  ```

---

### 2. Payments Integration (Paystack & M-Pesa STK Push)

#### **Initialize Paystack Checkout Gateway**
* `POST /api/payments/paystack/initialize`
* **Request Payload**:
  ```json
  {
    "email": "ngugimaina4@gmail.com",
    "amount": "100"
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "authorization_url": "https://checkout.paystack.com/...",
    "reference": "pstk_ref_xyz"
  }
  ```

#### **Trigger Paystack via M-Pesa STK Push (Mobile-Friendly)**
* `POST /api/payments/paystack/stk-push`
* **Request Payload**:
  ```json
  {
    "email": "user@example.com",
    "amount": 100,
    "phone": "0722000000"
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "message": "Mobile STK Push triggered successfully.",
    "reference": "stk-xxxxxx"
  }
  ```

#### **Verify Payment Status**
* `GET /api/payments/status`
* **URL Query Parameters**: `?reference=your_reference_string`
* **Response**:
  ```json
  {
    "success": true,
    "status": "success",
    "reference": "stk-xxxxxx"
  }
  ```

---

### 3. Authentication & Profile Me

These authorization routes require a JSON Web Token (JWT) in the `Authorization` header for access: `Authorization: Bearer <your_jwt_token_here>`.

#### **User Registration**
* `POST /api/auth/register`
* **Payload**:
  ```json
  {
    "name": "Alex Ngugi",
    "email": "user@example.com",
    "password": "strongpassword123",
    "phone": "0722603149"
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOi...",
    "user": {
      "id": "usr_xxxx",
      "name": "Alex Ngugi",
      "email": "user@example.com"
    }
  }
  ```

#### **User Login**
* `POST /api/auth/login`
* **Payload**:
  ```json
  {
    "email": "user@example.com",
    "password": "strongpassword123"
  }
  ```
* **Response**: Same as registration (Includes Auth token Bearer string).

#### **Fetch Authorized Profile Context**
* `GET /api/auth/me`
* **Header**: `Authorization: Bearer <token>`
* **Response**:
  ```json
  {
    "success": true,
    "user": {
      "userId": "usr_xxxx",
      "name": "Alex Ngugi",
      "email": "user@example.com",
      "phone": "0722603149"
    }
  }
  ```

#### **Fetch User Transaction History**
* `GET /api/secure/transactions`
* **Header**: `Authorization: Bearer <token>`
* **Response**:
  ```json
  {
    "success": true,
    "count": 2,
    "data": [
      {
        "id": "tx_abc123",
        "user_id": "usr_xxxx",
        "amount": 250.00,
        "status": "completed",
        "reference": "stk-xxxx",
        "created_at": "2026-05-31T15:20:00Z"
      }
    ]
  }
  ```

---

### 4. Direct Database / Query Access (Secured for Android Control)

If your app needs to load or update transactions or customer configurations dynamically, utilize these direct postgres routes:

#### **Get Current Server Config Properties**
* `GET /api/db/config`
* **Response**: Returns full details on Port, Max Connections, DB credentials, or URLs.

#### **Execute Query Sandbox (Generic)**
* `GET /api/db/query`
* **URL Query Parameters**: `?sql=SELECT * FROM transactions LIMIT 5`
* **Response**:
  ```json
  {
    "success": true,
    "count": 5,
    "data": [...]
  }
  ```

---

## 🛠️ Step-by-Step Android Setup
1. Include the following packages inside your App build file (`app/build.gradle.kts`):
   ```kotlin
   implementation("com.squareup.retrofit2:retrofit:2.9.0")
   implementation("com.squareup.retrofit2:converter-gson:2.9.0")
   implementation("com.squareup.okhttp3:okhttp:4.11.0")
   implementation("com.squareup.okhttp3:logging-interceptor:4.11.0")
   ```
2. Enable Internet Permissions inside `AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.INTERNET" />
   ```
   *(Ensure cleartext traffic is enabled in your network settings if testing against a raw local HTTP workspace server).*
