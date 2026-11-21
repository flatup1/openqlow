package app.aiglasses.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TransferErrorTest {

    private val allErrors = listOf(
        TransferError.InsufficientStorage,
        TransferError.ConnectionLost,
        TransferError.WifiConnectFailed,
        TransferError.BluetoothOff,
        TransferError.DeviceNotFound,
        TransferError.PermissionDenied,
        TransferError.HttpError(404),
        TransferError.HttpError(503),
        TransferError.SizeMismatch(expectedBytes = 100, actualBytes = 50),
    )

    @Test
    fun `どのエラーにも必ず次の操作が書いてある`() {
        for (error in allErrors) {
            assertTrue(error.userMessage.isNotBlank(), "$error に説明がない")
            assertTrue(error.nextAction.isNotBlank(), "$error に次の操作がない")
        }
    }

    @Test
    fun `エラー文に専門用語を使わない`() {
        val forbidden = listOf("HTTP", "BLE", "null", "Exception", "エラーコード", "socket", "timeout")
        for (error in allErrors) {
            val text = error.userMessage + error.nextAction
            for (word in forbidden) {
                assertFalse(
                    text.contains(word, ignoreCase = true),
                    "$error の文言に専門用語「$word」が入っている: $text",
                )
            }
        }
    }

    @Test
    fun `グラス側の一時的な不調はやり直す価値がある`() {
        assertTrue(TransferError.HttpError(500).retryable)
        assertTrue(TransferError.HttpError(503).retryable)
    }

    @Test
    fun `やり直しても同じ結果になるものは自動でやり直さない`() {
        assertFalse(TransferError.HttpError(404).retryable)
        assertFalse(TransferError.InsufficientStorage.retryable, "空き容量は増えないのでやり直す意味がない")
        assertFalse(TransferError.PermissionDenied.retryable)
        assertFalse(TransferError.BluetoothOff.retryable)
        assertFalse(TransferError.DeviceNotFound.retryable)
    }

    @Test
    fun `通信が切れた場合はやり直す`() {
        assertTrue(TransferError.ConnectionLost.retryable)
        assertTrue(TransferError.WifiConnectFailed.retryable)
        assertTrue(TransferError.SizeMismatch(100, 50).retryable)
    }

    @Test
    fun `通信が切れたときは取り込み済みが残ることを伝える`() {
        assertTrue(
            TransferError.ConnectionLost.nextAction.contains("残っています"),
            "ユーザーを不安にさせないため、消えていないことを伝えるべき",
        )
    }

    @Test
    fun `やり直せるかどうかで案内の言葉を変える`() {
        assertEquals(
            "少し待ってから、もう一度お試しください",
            TransferError.HttpError(503).nextAction,
        )
        assertTrue(TransferError.HttpError(404).nextAction.contains("電源を入れ直"))
    }
}
