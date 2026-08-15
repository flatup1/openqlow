"""SNS 投稿文の下書きを作る（純ロジック・外部依存ゼロ）。

**LLM を使わない理由**
投稿文に必要なのは「大会名・選手名・結果・ハッシュタグ」で、
これは全部こちらが持っているデータです。文章を発明する必要がありません。
外部APIに頼ると、無料枠の条件が変わった日に投稿が止まります。

**送信はしません。** ここで作るのは下書きのテキストだけです。
公開・投稿はオーナー承認後に人間が行います（承認マトリクスのとおり）。
"""

from __future__ import annotations

from dataclasses import dataclass, field

MAX_X_LENGTH = 140
"""X の1投稿の目安。URL を足す余地を残して少なめにしておく。"""


@dataclass
class CaptionContext:
    event: str
    index: int
    red: str | None = None
    blue: str | None = None
    result: str | None = None
    note: str | None = None
    hashtags: list[str] = field(default_factory=lambda: ["UIZIN", "格闘技", "アマチュア格闘技"])

    @property
    def versus(self) -> str:
        if self.red and self.blue:
            return f"{self.red} vs {self.blue}"
        return f"第{self.index}試合"

    @property
    def tag_line(self) -> str:
        return " ".join(f"#{tag.lstrip('#')}" for tag in self.hashtags if tag)


def _result_line(context: CaptionContext) -> str:
    if not context.result:
        return ""
    return f"結果: {context.result}"


def youtube_title(context: CaptionContext) -> str:
    return f"【{context.event}】{context.versus}"


def youtube_description(context: CaptionContext) -> str:
    lines = [
        f"{context.event} 第{context.index}試合",
        context.versus,
    ]
    result = _result_line(context)
    if result:
        lines.append(result)
    if context.note:
        lines.append(context.note)
    lines += [
        "",
        "※ 試合映像の切り抜きです。",
        context.tag_line,
    ]
    return "\n".join(line for line in lines if line is not None)


def short_caption(context: CaptionContext, *, limit: int | None = None) -> str:
    """TikTok / Instagram / X 共通の短い文。長さ上限があれば末尾を削る。"""
    head = f"【{context.event}】{context.versus}"
    result = _result_line(context)
    body = f"{head}\n{result}\n{context.tag_line}" if result else f"{head}\n{context.tag_line}"
    if limit is None or len(body) <= limit:
        return body

    # 削る順番: 注記 → 結果 → ハッシュタグを減らす。大会名と選手名は最後まで残す。
    trimmed = f"{head}\n{context.tag_line}"
    if len(trimmed) <= limit:
        return trimmed
    tags = list(context.hashtags)
    while tags and len(f"{head}\n" + " ".join(f"#{t.lstrip('#')}" for t in tags)) > limit:
        tags.pop()
    if tags:
        return f"{head}\n" + " ".join(f"#{t.lstrip('#')}" for t in tags)
    return head[:limit]


def build_all(context: CaptionContext) -> dict[str, str]:
    """媒体ごとの下書きをまとめて返す。"""
    return {
        "youtube_title": youtube_title(context),
        "youtube_description": youtube_description(context),
        "tiktok": short_caption(context),
        "instagram": short_caption(context),
        "x": short_caption(context, limit=MAX_X_LENGTH),
    }


def render_text(context: CaptionContext) -> str:
    """人間がコピペしやすい1枚のテキストにする。"""
    drafts = build_all(context)
    return "\n".join(
        [
            "# YouTube タイトル",
            drafts["youtube_title"],
            "",
            "# YouTube 説明文",
            drafts["youtube_description"],
            "",
            "# TikTok / Instagram",
            drafts["tiktok"],
            "",
            f"# X（{MAX_X_LENGTH}文字以内）",
            drafts["x"],
            "",
        ]
    )
