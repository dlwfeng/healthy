package com.example.zhixu_mobile

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.security.MessageDigest

class MainActivity : FlutterActivity() {
    @Suppress("DEPRECATION")
    private fun version(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

    @Suppress("DEPRECATION")
    private fun signatures(info: PackageInfo): Set<String> {
        val values = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners
            else info.signatures
        return values?.map { signature ->
            MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())
                .joinToString("") { "%02x".format(it) }
        }?.toSet() ?: emptySet()
    }

    @Suppress("DEPRECATION")
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "healthy/network_tasks")
            .setMethodCallHandler { call, result ->
                val id = call.argument<String>("id")
                if (id == null) {
                    result.error("invalid_task", "缺少请求标识。", null)
                } else {
                    try {
                        when (call.method) {
                            "acquire" -> { NetworkTaskService.acquire(applicationContext, id); result.success(true) }
                            "release" -> { NetworkTaskService.release(applicationContext, id); result.success(true) }
                            else -> result.notImplemented()
                        }
                    } catch (error: Exception) {
                        result.error("background_unavailable", error.message, null)
                    }
                }
            }
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES
            else PackageManager.GET_SIGNATURES
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "healthy/app_update")
            .setMethodCallHandler { call, result ->
                val installed = packageManager.getPackageInfo(packageName, flags)
                when (call.method) {
                    "appInfo" -> result.success(mapOf(
                        "version" to installed.versionName, "buildNumber" to version(installed)))
                    "installApk" -> {
                        val path = call.argument<String>("path")
                        val digest = call.argument<String>("sha256")
                        val expectedBuild = call.argument<Number>("buildNumber")?.toLong()
                        // Hash and parse away from the UI thread.
                        Thread {
                            try {
                                require(path != null && digest != null && expectedBuild != null) {
                                    "安装参数无效，请重新下载。"
                                }
                                val file = File(path).canonicalFile
                                require(file.parentFile == File(cacheDir, "updates").canonicalFile &&
                                    file.name == "healthy.apk" && file.isFile &&
                                    file.length() in 1..(512L * 1024 * 1024)) {
                                    "安装包路径无效，请重新下载。"
                                }
                                val hash = MessageDigest.getInstance("SHA-256")
                                file.inputStream().use { input ->
                                    val buffer = ByteArray(64 * 1024)
                                    while (true) {
                                        val count = input.read(buffer)
                                        if (count < 0) break
                                        hash.update(buffer, 0, count)
                                    }
                                }
                                val actual = hash.digest().joinToString("") { "%02x".format(it) }
                                require(actual == digest) { "安装包校验失败，请重新下载。" }
                                val archive = packageManager.getPackageArchiveInfo(file.path, flags)
                                require(archive != null && archive.packageName == packageName) {
                                    "安装包不属于 healthy，请重新检查更新。"
                                }
                                require(version(archive) == expectedBuild && expectedBuild > version(installed)) {
                                    "安装包版本无效或不是新版本，请重新检查更新。"
                                }
                                require(signatures(installed).isNotEmpty() &&
                                    signatures(archive) == signatures(installed)) {
                                    "安装包签名与当前应用不一致，无法覆盖更新。"
                                }
                                runOnUiThread {
                                    try {
                                        if (Build.VERSION.SDK_INT >= 26 &&
                                            !packageManager.canRequestPackageInstalls()) {
                                            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                                Uri.parse("package:$packageName")))
                                            result.success("permission_required")
                                        } else {
                                            val uri = FileProvider.getUriForFile(this, "$packageName.updates", file)
                                            startActivity(Intent(Intent.ACTION_VIEW).apply {
                                                setDataAndType(uri, "application/vnd.android.package-archive")
                                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                                clipData = ClipData.newRawUri("healthy update", uri)
                                            })
                                            result.success("installer_opened")
                                        }
                                    } catch (error: Exception) {
                                        result.error("install_failed", "无法打开系统安装界面：${error.message}", null)
                                    }
                                }
                            } catch (error: Exception) {
                                runOnUiThread { result.error("invalid_apk", error.message, null) }
                            }
                        }.start()
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
