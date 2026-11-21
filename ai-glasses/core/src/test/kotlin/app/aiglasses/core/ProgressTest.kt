package app.aiglasses.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ProgressTest {

    private fun progress(
        total: Int = 10, done: Int = 3,
        totalBytes: Long = 10_000, receivedBytes: Long = 3_000,
    ) = Progress(
        total = total, done = done, failed = 0, held = 0, inProgress = 1,
        currentLabel = null, totalBytes = totalBytes, receivedBytes = receivedBytes,
    )

    @Test
    fun `件数を分かりやすい言葉で出す`() {
        assertEquals("10件中3件完了", progress().label())
    }

    @Test
    fun `進み具合を割合で出せる`() {
        assertEquals(0.3, progress().fraction())
    }

    @Test
    fun `まだ何も無いときは割合ゼロで落ちない`() {
        assertEquals(0.0, progress(totalBytes = 0, receivedBytes = 0).fraction())
    }

    @Test
    fun `十分なデータがあるときだけ残り時間を出す`() {
        // 10秒で3000バイト → 残り7000バイトなので約23秒
        val remaining = assertNotNull(progress().estimateRemainingSeconds(elapsedMs = 10_000))
        assertEquals(23L, remaining)
    }

    @Test
    fun `始まった直後は残り時間を出さない`() {
        assertNull(
            progress().estimateRemainingSeconds(elapsedMs = 500),
            "数字が大きく揺れて逆に不安にさせるので出さない",
        )
    }

    @Test
    fun `まだ一バイトも受け取っていなければ残り時間を出さない`() {
        assertNull(progress(receivedBytes = 0).estimateRemainingSeconds(elapsedMs = 10_000))
    }

    @Test
    fun `全体の大きさが分からなければ残り時間を出さない`() {
        assertNull(progress(totalBytes = 0).estimateRemainingSeconds(elapsedMs = 10_000))
    }

    @Test
    fun `受け取り終わっていれば残り時間を出さない`() {
        assertNull(
            progress(totalBytes = 3_000, receivedBytes = 3_000)
                .estimateRemainingSeconds(elapsedMs = 10_000),
        )
    }
}
