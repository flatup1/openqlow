package app.aiglasses.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SafeLogTest {

    @Test
    fun `WiFiのパスワードをログに残さない`() {
        val line = "connecting ssid=GLASS-A1B2 password=hunter2 channel=6"
        val safe = SafeLog.redact(line)

        assertFalse(safe.contains("hunter2"), "パスワードが漏れている: $safe")
        assertTrue(safe.contains("GLASS-A1B2"), "不具合追跡に必要なSSIDまで消えている")
    }

    @Test
    fun `JSON風の書き方でも秘密情報を隠す`() {
        val line = """{"ssid":"GLASS-A1","psk":"s3cret!","ip":"192.168.4.1"}"""
        val safe = SafeLog.redact(line)

        assertFalse(safe.contains("s3cret!"))
        assertTrue(safe.contains("192.168.4.1"), "IPは不具合追跡に必要なので残す")
    }

    @Test
    fun `いろいろな呼び方の秘密情報を隠す`() {
        val cases = listOf(
            "password=abc123", "passwd: abc123", "pwd=abc123",
            "psk=abc123", "passphrase=abc123", "secret=abc123",
            "token=abc123", "api_key=abc123", "API-KEY: abc123",
        )
        for (case in cases) {
            assertFalse(SafeLog.redact(case).contains("abc123"), "隠せていない: $case")
        }
    }

    @Test
    fun `秘密情報が無い文はそのまま`() {
        val line = "downloaded 3 of 10 files"
        assertEquals(line, SafeLog.redact(line))
    }

    @Test
    fun `ログに実際のファイル名を書かない`() {
        val item = photo(id = "abc", name = "娘の誕生日パーティー.JPG")
        val label = SafeLog.fileLabel(item)

        assertFalse(label.contains("娘"), "個人情報が漏れている: $label")
        assertTrue(label.startsWith("写真#"))
    }

    @Test
    fun `同じファイルなら毎回同じ呼び名になる`() {
        val item = photo("abc")
        assertEquals(SafeLog.fileLabel(item), SafeLog.fileLabel(item))
    }

    @Test
    fun `違うファイルは違う呼び名になる`() {
        assertFalse(SafeLog.fileLabel(photo("abc")) == SafeLog.fileLabel(photo("xyz")))
    }

    @Test
    fun `動画と写真を呼び分ける`() {
        val video = MediaItem("v1", "a.mp4", MediaType.VIDEO, 100, null, "/files/a.mp4")
        assertTrue(SafeLog.fileLabel(video).startsWith("動画#"))
    }
}
