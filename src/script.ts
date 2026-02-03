//#region constants
import {
    CreatorStatus,
    CreatorVideosResponse,
    FloatplaneSource,
    Delivery,
    DeliveryVariant,
    ParentImage,
    Post,
    SubscriptionResponse,
    VideoAttachment,
    MediaType,
    Settings,
    State,
    StreamFormat
} from "./types.js"

const PLATFORM = "Floatplane"
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"

const PLATFORM_URL = "https://www.floatplane.com"
const BASE_API_URL = "https://www.floatplane.com/api"
const SUBSCRIPTIONS_URL = `${BASE_API_URL}/v3/user/subscriptions` as const
const POST_URL = `${BASE_API_URL}/v3/content/post` as const
const DELIVERY_URL = `${BASE_API_URL}/v3/delivery/info` as const
const LIST_URL = `${BASE_API_URL}/v3/content/creator/list` as const

const HARDCODED_ZERO = 0
const HARDCODED_EMPTY_STRING = ""
const EMPTY_AUTHOR = new PlatformAuthorLink(new PlatformID(PLATFORM, "", plugin.config.id), "", "")

// this API reference makes everything super easy
// https://jman012.github.io/FloatplaneAPIDocs/SwaggerUI-full/

const local_http = http
// const local_utility = utility

let local_settings: Settings

/** State */
let local_state: State
//#endregion

//#region source methods
const local_source: FloatplaneSource = {
    enable,
    disable,
    saveState,
    getHome,
    isContentDetailsUrl,
    getContentDetails,
}
init_source(local_source)
function init_source<
    ChannelTypes extends never,
    SearchTypes extends never,
    ChannelSearchTypes extends never
>(local_source: Source<never, never, never, never, ChannelTypes, SearchTypes, ChannelSearchTypes, Settings>) {
    for (const method_key of Object.keys(local_source)) {
        // @ts-expect-error assign to readonly constant source object
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        source[method_key] = local_source[method_key]
    }
}
//#endregion

//#region enable
function enable(conf: SourceConfig, settings: Settings, saved_state?: string | null) {
    if (IS_TESTING) {
        log("IS_TESTING true")
        log("logging configuration")
        log(conf)
        log("logging settings")
        log(settings)
        log("logging savedState")
        log(saved_state)
    }
    local_settings = settings

    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException("login to watch floatplane")
    }

    const client_id = local_http.getDefaultClient(true).clientId
    if (client_id === undefined) {
        throw new ScriptException("missing client id")
    }

    if (saved_state !== null && saved_state !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const state: State = JSON.parse(saved_state)
        local_state = { ...state, client_id }
    } else {
        local_state = { client_id }
    }
}
//#endregion

function disable() {
    log("Floatplane log: disabling")
}

function saveState() {
    return JSON.stringify(local_state)
}

//#region home
function getHome(): ContentPager {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException("login to use floatplane")
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: SubscriptionResponse[] = JSON.parse(local_http.GET(SUBSCRIPTIONS_URL, { "User-Agent": USER_AGENT }, true).body)

    const limit = 20
    const pager = new HomePager(response.map(c => c.creator), limit)
    return pager
}
function create_thumbnails(thumbs: ParentImage | null): Thumbnails {
    if (thumbs == null)
        return new Thumbnails([])

    return new Thumbnails([thumbs, ...thumbs.childImages].map(
        (t) => new Thumbnail(t.path, t.height)
    ))
}

function create_platform_video(blog: Post): PlatformVideo | null {
    if (blog.metadata.hasVideo) {
        return new PlatformVideo({
            id: new PlatformID("Floatplane", blog.id, plugin.config.id),
            name: blog.title,
            thumbnails: create_thumbnails(blog.thumbnail),
            author: new PlatformAuthorLink(
                new PlatformID("Floatplane", blog.channel.creator + ":" + blog.channel.id, plugin.config.id),
                blog.channel.title,
                ChannelUrlFromBlog(blog),
                blog.channel.icon?.path ?? ""
            ),
            datetime: new Date(blog.releaseDate).getTime() / 1000,
            duration: blog.metadata.videoDuration,
            viewCount: 0,
            url: PLATFORM_URL + "/post/" + blog.id,
            shareUrl: PLATFORM_URL + "/post/" + blog.id,
            isLive: false
        })
    }

    // TODO: Support live videos
    // TODO: Images
    // TODO: Audio
    // TODO: Gallery
    // throw new ScriptException("The following blog has no video: " + blog.id);
    return null
}
function ChannelUrlFromBlog(blog: Post): string {
    return PLATFORM_URL + "/channel/" + blog.creator.urlname + "/home/" + blog.channel.urlname
}

class HomePager extends ContentPager {
    private readonly creators: Record<string, CreatorStatus>
    constructor(creator_ids: string[], private readonly limit: number) {
        const url = new URL(LIST_URL)
        url.searchParams.set("limit", limit.toString())
        creator_ids.forEach((creator_id, index) => { url.searchParams.set(`ids[${index.toString()}]`, creator_id) })

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CreatorVideosResponse = JSON.parse(local_http.GET(url.toString(), {}, true).body)

        const creators: Record<string, CreatorStatus> = {}
        let has_more = false
        for (const data of response.lastElements) {
            creators[data.creatorId] = data
            has_more ||= data.moreFetchable
        }

        const results = response.blogPosts.map(create_platform_video).filter(x => x !== null)

        super(results, has_more)
        this.creators = creators
    }
    override nextPage(this: HomePager) {
        const url = new URL(LIST_URL)
        url.searchParams.set("limit", this.limit.toString())
        Object.values(this.creators).forEach((creator, index) => {
            url.searchParams.set(`ids[${index.toString()}]`, creator.creatorId)

            if (creator.blogPostId) {
                url.searchParams.set(`fetchAfter[${index.toString()}][creatorId]`, creator.creatorId)
                url.searchParams.set(`fetchAfter[${index.toString()}][blogPostId]`, creator.blogPostId)
                url.searchParams.set(`fetchAfter[${index.toString()}][moreFetchable]`, creator.moreFetchable.toString())
            }
        })

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CreatorVideosResponse = JSON.parse(local_http.GET(url.toString(), {}, true).body)

        let has_more = false
        for (const data of response.lastElements) {
            this.creators[data.creatorId] = data
            has_more ||= data.moreFetchable
        }

        this.hasMore = has_more
        this.results = response.blogPosts.map(create_platform_video).filter(x => x !== null)
        return this
    }
    override hasMorePagers(this: HomePager): boolean {
        return this.hasMore
    }
}
//#endregion

//#region 
function isContentDetailsUrl(url: string) {
    return /^https?:\/\/(www\.)?floatplane\.com\/post\/[\w\d]+$/.test(url)
}
function getContentDetails(url: string): PlatformContentDetails {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException("login to watch floatplane")
    }
    const post_id: string | undefined = url.split("/").pop()

    if (post_id === undefined) {
        throw new ScriptException("unreachable")
    }

    const api_url = new URL(POST_URL)
    api_url.searchParams.set("id", post_id)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: Post = JSON.parse(local_http.GET(api_url.toString(), {}, true).body)

    if (response.metadata.hasVideo) {
        if (response.metadata.hasAudio || response.metadata.hasPicture || response.metadata.hasGallery) {
            bridge.toast("Mixed content not supported; only showing video")
        }
        const videos = create_video_descriptor(response.videoAttachments)

        return new PlatformVideoDetails({
            id: new PlatformID(PLATFORM, post_id, plugin.config.id),
            name: response.title,
            description: response.text,
            thumbnails: create_thumbnails(response.thumbnail),
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, response.channel.creator + ":" + response.channel.id, plugin.config.id),
                response.channel.title,
                ChannelUrlFromBlog(response),
                response.channel.icon?.path ?? ""
            ),
            datetime: new Date(response.releaseDate).getTime() / 1000,
            duration: response.metadata.videoDuration,
            // TODO: implement view count
            viewCount: HARDCODED_ZERO,
            url: PLATFORM_URL + "/post/" + response.id,
            shareUrl: PLATFORM_URL + "/post/" + response.id,
            isLive: false,
            video: videos,
            rating: new RatingLikesDislikes(response.likes, response.dislikes),
            subtitles: []
        })
    }

    if (response.metadata.hasAudio) {
        throw new ScriptException("Audio content not supported")
    }

    if (response.metadata.hasPicture) {
        throw new ScriptException("Picture content not supported")
    }

    if (response.metadata.hasGallery) {
        throw new ScriptException("Gallery content not supported")
    }

    throw new ScriptException("Content type not supported")
}
function create_video_source(
    duration: number,
    origin: string,
    variant: DeliveryVariant,
    media_type: MediaType
): VideoUrlSource | HLSSource {
    switch (media_type) {
        case "flat":
            return new VideoUrlSource({
                width: variant.meta.video.width,
                height: variant.meta.video.height,
                container: variant.mimeType,
                codec: variant.meta.video.codec,
                name: variant.label,
                bitrate: variant.meta.video.bitrate.average,
                duration,
                url: `${origin}${variant.url}`
            })
        case "hls.fmp4":
            return new HLSSource({
                name: variant.label,
                url: `${origin}${variant.url}`,
                duration,
                priority: true,
                language: Language.UNKNOWN,
                requestModifier: {
                    options: {
                        applyAuthClient: local_state.client_id
                    }
                }
            })
        case "hls.mpegts":
            return new HLSSource({
                name: variant.label,
                url: `${origin}${variant.url}`,
                duration,
                priority: false,
                language: Language.UNKNOWN,
                requestModifier: {
                    options: {
                        applyAuthClient: local_state.client_id
                    }
                }
            })
        default:
            throw assert_exhaustive(media_type, "unreachable")
    }
}
function create_video_descriptor(attachments: VideoAttachment[]): VideoSourceDescriptor {
    const media_type = get_format(local_settings.stream_format)
    return new VideoSourceDescriptor(attachments.flatMap((video) => {
        const url = new URL(DELIVERY_URL)
        url.searchParams.set("scenario", "onDemand")
        url.searchParams.set("entityId", video.id)
        url.searchParams.set("outputKind", media_type)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: Delivery = JSON.parse(local_http.GET(url.toString(), { accept: "application/json" }, true).body)
        return response.groups.flatMap((group) => {
            return group.variants.map((variant) => {
                const origin = group.origins[0]
                if (origin === undefined) {
                    throw new ScriptException("unreachable")
                }

                return create_video_source(
                    video.duration,
                    origin.url,
                    variant,
                    media_type
                )
            })
        })
    }))
}
//#endregion

//#region utilities
/**
 * Converts seconds to the timestamp format used in WebVTT
 * @param seconds 
 * @returns 
 */
function milliseconds_to_WebVTT_timestamp(milliseconds: number) {
    return new Date(milliseconds).toISOString().substring(11, 23)
}
function get_format(setting: StreamFormat): MediaType {
    switch (setting) {
        case StreamFormat.HLS:
            return "hls.fmp4"
        case StreamFormat.LegacyHLS:
            return "hls.mpegts"
        case StreamFormat.FlatMP4:
            return "flat"
        default:
            throw assert_exhaustive(setting, "unreachable")
    }
}
function assert_exhaustive(value: never): void
function assert_exhaustive(value: never, exception_message: string): ScriptException
function assert_exhaustive(value: never, exception_message?: string): ScriptException | undefined {
    log(["Floatplane log:", value])
    if (exception_message !== undefined) {
        return new ScriptException(exception_message)
    }
    return
}
//#endregion

console.log(milliseconds_to_WebVTT_timestamp, HARDCODED_EMPTY_STRING, EMPTY_AUTHOR)
// export statements are removed during build step
// used for unit testing in script.test.ts
export { milliseconds_to_WebVTT_timestamp }
