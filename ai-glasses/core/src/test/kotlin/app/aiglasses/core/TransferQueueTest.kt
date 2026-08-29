package app.aiglasses.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TransferQueueTest {

    @Test
    fun `待ち行列に入れて順番に取り出せる`() {
        val q = TransferQueue()
        assertEquals(2, q.enqueue(listOf(photo("A"), photo("B"))))

        assertEquals("A", q.nextPending()?.item?.id)
        assertEquals("B", q.nextPending()?.item?.id)
        assertNull(q.nextPending(), "もう無いのに取り出せてしまった")
    }

    @Test
    fun `同じものを二回入れても行列は増えない`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A")))
        assertEquals(0, q.enqueue(listOf(photo("A"))))
        assertEquals(1, q.jobs().size)
    }

    @Test
    fun `大きさが合っていれば完了になる`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A", size = 1_000)))
        q.nextPending()

        assertNull(q.complete("A", actualBytes = 1_000))
        assertEquals(TransferState.DONE, q.job("A")?.state)
    }

    @Test
    fun `大きさが違ったら完了にせず、壊れたファイルを残さない`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A", size = 1_000)))
        q.nextPending()

        val error = q.complete("A", actualBytes = 640)

        assertTrue(error is TransferError.SizeMismatch)
        assertFalse(q.job("A")?.state == TransferState.DONE, "壊れているのに完了になった")
    }

    @Test
    fun `グラスが大きさを教えない機種では大きさ検査を飛ばす`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A", size = 0)))
        q.nextPending()

        assertNull(q.complete("A", actualBytes = 12_345))
        assertEquals(TransferState.DONE, q.job("A")?.state)
    }

    @Test
    fun `通信が切れても完了済みのデータは消えない`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A"), photo("B")))

        q.nextPending()
        q.complete("A", actualBytes = 1_000)   // Aは取り込み済み
        q.nextPending()                        // Bを転送中
        q.recordBytes("B", 400)

        val interrupted = q.onDisconnected()

        assertEquals(1, interrupted, "転送中だったBだけが中断されるはず")
        assertEquals(TransferState.DONE, q.job("A")?.state, "完了済みのAが失われた")
        assertEquals(TransferState.HELD, q.job("B")?.state)
    }

    @Test
    fun `再接続すると保留中のものが自動でやり直しの対象に戻る`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A")))
        q.nextPending()
        q.onDisconnected()

        assertEquals(1, q.releaseHeld())
        assertEquals(TransferState.PENDING, q.job("A")?.state)
        assertEquals("A", q.nextPending()?.item?.id)
    }

    @Test
    fun `途中から再開できる機種では受け取り済みの続きから取り直す`() {
        val q = TransferQueue(resumePolicy = ResumePolicy.SUPPORTED)
        q.enqueue(listOf(photo("A", size = 1_000)))
        q.nextPending()
        q.recordBytes("A", 400)
        q.onDisconnected()
        q.releaseHeld()

        assertEquals(400L, q.resumeOffsetFor("A"))
    }

    @Test
    fun `途中から再開できない機種では最初から取り直す`() {
        val q = TransferQueue(resumePolicy = ResumePolicy.NOT_SUPPORTED)
        q.enqueue(listOf(photo("A", size = 1_000)))
        q.nextPending()
        q.recordBytes("A", 400)
        q.onDisconnected()
        q.releaseHeld()

        assertEquals(0L, q.resumeOffsetFor("A"))
        assertEquals(0L, q.job("A")?.bytesReceived, "捨てたはずの途中データが残っている")
    }

    @Test
    fun `再開できるか未確認のときは安全側に倒して最初から取り直す`() {
        val q = TransferQueue(resumePolicy = ResumePolicy.UNKNOWN)
        q.enqueue(listOf(photo("A", size = 1_000)))
        q.nextPending()
        q.recordBytes("A", 400)
        q.onDisconnected()
        q.releaseHeld()

        assertEquals(0L, q.resumeOffsetFor("A"))
    }

    @Test
    fun `やり直す価値のないエラーは保留にせず失敗にする`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A")))
        q.nextPending()

        q.fail("A", TransferError.InsufficientStorage)

        assertEquals(TransferState.FAILED, q.job("A")?.state)
        assertEquals(0, q.releaseHeld(), "失敗のものを自動でやり直してはいけない")
    }

    @Test
    fun `やり直しの上限を超えたら失敗にしてユーザーに判断を返す`() {
        val q = TransferQueue(maxAttempts = 2)
        q.enqueue(listOf(photo("A")))

        q.nextPending()                                  // 1回目
        q.fail("A", TransferError.ConnectionLost)
        assertEquals(TransferState.HELD, q.job("A")?.state)

        q.releaseHeld()
        q.nextPending()                                  // 2回目（上限）
        q.fail("A", TransferError.ConnectionLost)

        assertEquals(TransferState.FAILED, q.job("A")?.state)
    }

    @Test
    fun `完了済みのものに失敗を報告しても状態は変わらない`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A", size = 1_000)))
        q.nextPending()
        q.complete("A", actualBytes = 1_000)

        q.fail("A", TransferError.ConnectionLost)

        assertEquals(TransferState.DONE, q.job("A")?.state)
    }

    @Test
    fun `完了したものだけを取り込み済み記録に残す`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A", size = 100), photo("B", size = 100)))
        q.nextPending()
        q.complete("A", actualBytes = 100)
        q.nextPending()
        q.fail("B", TransferError.InsufficientStorage)

        val index = InMemorySavedMediaIndex()
        q.recordCompletedInto(index)

        assertEquals(1, index.size)
        assertTrue(index.containsId("A"))
        assertFalse(index.containsId("B"), "失敗したものを取り込み済みにしてはいけない")
    }

    @Test
    fun `完了と失敗と保留の件数を区別できる`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A", size = 100), photo("B", size = 100), photo("C", size = 100)))

        q.nextPending(); q.complete("A", 100)
        q.nextPending(); q.fail("B", TransferError.InsufficientStorage)
        q.nextPending(); q.fail("C", TransferError.ConnectionLost)

        val p = q.progress()
        assertEquals(3, p.total)
        assertEquals(1, p.done)
        assertEquals(1, p.failed)
        assertEquals(1, p.held)
        assertEquals("3件中1件完了", p.label())
    }

    @Test
    fun `やることが残っているかを判定できる`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A", size = 100)))
        assertTrue(q.hasWork())

        q.nextPending()
        q.complete("A", 100)
        assertFalse(q.hasWork())
    }

    @Test
    fun `転送中のファイルは実名ではなく安全な呼び名で表示される`() {
        val q = TransferQueue()
        q.enqueue(listOf(photo("A", name = "娘の誕生日.JPG")))
        q.nextPending()

        val label = assertNotNull(q.progress().currentLabel)
        assertFalse(label.contains("娘"), "実際のファイル名が漏れている: $label")
        assertTrue(label.startsWith("写真#"))
    }
}
