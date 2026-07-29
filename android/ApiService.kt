package com.errandly.app.network

import retrofit2.Call
import retrofit2.http.*

// ==========================================
// 1. DATA MODELS (REQUEST / RESPONSE DTOs)
// ==========================================

data class GenericResponse(
    val success: Boolean,
    val message: String? = null,
    val error: String? = null
)

// -- Verification & OTP DTOs --
data class SendOtpRequest(
    val phoneNumber: String
)

data class VerifyOtpRequest(
    val phoneNumber: String,
    val code: String
)

data class VerifyOtpResponse(
    val message: String,
    val verified: Boolean
)

data class SendEmailRequest(
    val to: String,
    val type: String, // e.g. "verification", "otp", "payment"
    val reference: String? = null,
    val amount: Double? = 0.0
)

data class SendEmailResponse(
    val success: Boolean,
    val message: String
)

data class VerifyEmailRequest(
    val email: String,
    val code: String
)

data class VerifyEmailResponse(
    val success: Boolean,
    val message: String,
    val verified: Boolean
)

// -- Paystack Gateway Payment DTOs --
data class PaystackInitRequest(
    val email: String,
    val amount: String // String amount representation
)

data class PaystackInitResponse(
    val success: Boolean,
    val authorization_url: String?,
    val reference: String?,
    val error: String?
)

data class PaystackStkPushRequest(
    val email: String,
    val amount: Int, // Numeric amount
    val phone: String
)

data class PaystackStkPushResponse(
    val success: Boolean,
    val message: String?,
    val reference: String?,
    val error: String?
)

data class PaymentStatusResponse(
    val success: Boolean,
    val status: String?, // e.g., "success", "failed", "pending"
    val reference: String?,
    val amount: Double?,
    val error: String?
)

// -- Authentication DTOs --
data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String,
    val phone: String
)

data class LoginRequest(
    val email: String,
    val password: String
)

data class User(
    val id: String?,
    val userId: String?,
    val name: String,
    val email: String,
    val phone: String?
)

data class AuthResponse(
    val success: Boolean,
    val token: String?,
    val user: User?,
    val error: String?
)

data class ProfileResponse(
    val success: Boolean,
    val user: User?,
    val error: String?
)

// -- Postgres Database Query DTOs --
data class ErrandlyTransaction(
    val id: String,
    val user_id: String,
    val amount: Double,
    val status: String,
    val reference: String?,
    val description: String?,
    val created_at: String
)

data class TransactionsResponse(
    val success: Boolean,
    val count: Int,
    val data: List<ErrandlyTransaction>?,
    val error: String?
)

data class GenericQueryResponse(
    val success: Boolean,
    val count: Int,
    val data: List<Map<String, Any>>?,
    val error: String?
)


// ==========================================
// 2. RETROFIT API INTERFACE SPECIFICATION
// ==========================================

interface ApiService {

    // 🔑 AUTHENTICATION
    @POST("api/auth/register")
    fun register(@Body request: RegisterRequest): Call<AuthResponse>

    @POST("api/auth/login")
    fun login(@Body request: LoginRequest): Call<AuthResponse>

    @GET("api/auth/me")
    fun getProfile(@Header("Authorization") bearerToken: String): Call<ProfileResponse>


    // 📲 SMS & EMAIL OTP VERIFICATION
    @POST("api/notifications/send-otp")
    fun sendSMSOTP(@Body request: SendOtpRequest): Call<GenericResponse>

    @POST("api/notifications/verify-otp")
    fun verifySMSOTP(@Body request: VerifyOtpRequest): Call<VerifyOtpResponse>

    @POST("api/notifications/send-email")
    fun sendEmailOTP(@Body request: SendEmailRequest): Call<SendEmailResponse>

    @POST("api/notifications/verify-email")
    fun verifyEmailOTP(@Body request: VerifyEmailRequest): Call<VerifyEmailResponse>


    // 💳 PAYSTACK & STK PUSH PAYMENTS
    @POST("api/payments/paystack/initialize")
    fun initializePayment(@Body request: PaystackInitRequest): Call<PaystackInitResponse>

    @POST("api/payments/paystack/stk-push")
    fun triggerStkPush(@Body request: PaystackStkPushRequest): Call<PaystackStkPushResponse>

    @GET("api/payments/status")
    fun checkPaymentStatus(@Query("reference") reference: String): Call<PaymentStatusResponse>


    // 🔒 SECURE DATA USER CONTEXTS
    @GET("api/secure/transactions")
    fun getUserTransactions(@Header("Authorization") bearerToken: String): Call<TransactionsResponse>


    // 🗄️ DIRECT DATABASE CONTROL
    @GET("api/db/query")
    fun rawQuery(@Query("sql") sqlQuery: String): Call<GenericQueryResponse>
}
