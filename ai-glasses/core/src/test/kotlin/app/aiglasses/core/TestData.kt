package app.aiglasses.core

fun photo(
    id: String,
    name: String = "$id.JPG",
    size: Long = 1_000L,
    createdAt: Long? = 1_756_400_000_000L,
) = MediaItem(
    id = id,
    name = name,
    type = MediaType.PHOTO,
    sizeBytes = size,
    createdAtEpochMs = createdAt,
    downloadPath = "/files/$name",
)
