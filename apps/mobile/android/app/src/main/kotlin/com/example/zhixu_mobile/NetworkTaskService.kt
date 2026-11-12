package com.example.zhixu_mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/** Runs only while HTTP requests are active, including streaming bodies. */
class NetworkTaskService : Service() {
    companion object {
        private const val CHANNEL = "healthy_network_tasks"
        private val active = mutableSetOf<String>()

        fun acquire(context: Context, id: String) {
            if (active.contains(id)) return
            val first = active.isEmpty()
            active.add(id)
            if (first) {
                try {
                    ContextCompat.startForegroundService(context, Intent(context, NetworkTaskService::class.java))
                } catch (error: Exception) {
                    active.remove(id)
                    throw error
                }
            }
        }

        fun release(context: Context, id: String) {
            if (active.remove(id) && active.isEmpty()) {
                context.stopService(Intent(context, NetworkTaskService::class.java))
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "正在进行的请求", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val launch = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(this, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("健康助手")
            .setContentText("正在处理请求或下载，切换应用后继续。")
            .setContentIntent(pending)
            .setOngoing(true)
            .setSilent(true)
            .build()
        ServiceCompat.startForeground(this, 3060, notification,
            if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC else 0)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // A fast request can finish before Android delivers its service start.
        if (active.isEmpty()) stopSelf()
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        active.clear()
        stopSelf()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        active.clear()
        stopSelf()
    }

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
