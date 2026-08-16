package com.errandly.app.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson:GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitInstance {

    // Production Cloud API Gateway: "https://gateway.errandly.site/"
    // For local workstation: "http://127.0.0.1:3000/"
    private const val BASE_URL = "https://gateway.errandly.site/"

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    /**
     * Customized OkHttpClient with generous timeouts to allow Paystack checkout initializing,
     * SMS OTP deliveries, and long-polling M-Pesa STK Push payment confirmations to resolve safely.
     */
    private val client = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    val api: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}
