//#region constants
import {
    CommentResponse,
    CreatorStatus,
    CreatorVideosResponse,
    Delivery,
    DeliveryVariant,
    ParentImage,
    Post,
    SearchBlogPost,
    SearchResponse,
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
const COMMENTS_URL = `${BASE_API_URL}/v3/comment` as const
const SEARCH_URL = `${BASE_API_URL}/v3/search` as const
// const CREATOR_INFO_URL = `${BASE_API_URL}/v3/creator/info` as const
const CHANNEL_URL_PATTERN = /^https?:\/\/(www\.)?floatplane\.com\/channel\/[\w-]+/i

const HARDCODED_ZERO = 0
const HARDCODED_EMPTY_STRING = ""
function EMPTY_AUTHOR() { return new PlatformAuthorLink(new PlatformID(PLATFORM, "", plugin.config.id), "", "") }

// this API reference makes everything super easy
// https://jman012.github.io/FloatplaneAPIDocs/SwaggerUI-full/

const local_http = http
// const local_utility = utility

let local_settings: Settings

/** State */
let local_state: State

/** Helper function to get auth headers */
function getAuthHeaders(): Record<string, string> {
    return {
        "User-Agent": USER_AGENT
    }
}

//#endregion

function getChannelCapabilities(): ResultCapabilities<never, never, never, never> {
    return {
        types: ["video"] as never[],
        sorts: [] as never[],
        filters: {} as never
    }
}

function getChannelContents(_url: string, _type: any | null, _order: any | null, _filters: any): ContentPager {
    if (_type !== "video") {
        throw new ScriptException("Only video content supported")
    }
    throw new ScriptException("Channel contents not yet implemented")
}

//#region source methods
source.enable = function(_conf: SourceConfig, settings: unknown, saved_state?: string | null) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    local_settings = settings as Settings

    let client_id: string | null = null
    try {
        const cid = local_http.getDefaultClient(true).clientId
        client_id = cid ?? null
    } catch (e) {
        log(`Could not get client_id: ${String(e)}`)
    }

    if (saved_state !== null && saved_state !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const state: State = JSON.parse(saved_state)
        local_state = { ...state, client_id }
    } else {
        local_state = { client_id }
    }
}
source.disable = function() {
    log("Floatplane log: disabling")
}
source.saveState = function() {
    return JSON.stringify(local_state)
}
source.getHome = function(): ContentPager {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException("login to watch floatplane - use web login or enter sails.sid cookie in settings")
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: SubscriptionResponse[] = JSON.parse(local_http.GET(SUBSCRIPTIONS_URL, getAuthHeaders(), true).body)

    const limit = 20
    const pager = new HomePager(response.map(c => c.creator), limit)
    return pager
}
source.isContentDetailsUrl = function(url: string) {
    return /^https?:\/\/(www\.)?floatplane\.com\/post\/[\w\d]+$/.test(url)
}
source.getContentDetails = function(url: string): PlatformContentDetails {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException("login to watch floatplane")
    }
    const post_id: string | undefined = url.split("/").pop()

    if (post_id === undefined) {
        throw new ScriptException("unreachable")
    }

    const api_url = new URL(POST_URL)
    api_url.searchParams.set("id", post_id)

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
source.getComments = function(url: string): FloatplaneCommentPager {
    const post_id = url.split("/").pop()
    if (!post_id) {
        throw new ScriptException("Invalid URL")
    }
    return new FloatplaneCommentPager(post_id, 20)
};
source.getUserSubscriptions = function(): string[] {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException("login to import subscriptions")
    }

    const response = JSON.parse(
        local_http.GET(SUBSCRIPTIONS_URL, getAuthHeaders(), true).body
    ) as SubscriptionResponse[]

    const channels: string[] = []

    for (const sub of response) {
        try {
            const creatorUrl = new URL(`${BASE_API_URL}/v3/creator/info`)
            creatorUrl.searchParams.set("id", sub.creator)

            const creator = JSON.parse(
                local_http.GET(creatorUrl.toString(), getAuthHeaders(), true).body
            )

            channels.push(`${PLATFORM_URL}/channel/${creator.urlname}`)
        } catch (e) {
            log(`Failed to get creator info for ${sub.creator}: ${String(e)}`)
        }
    }

    return channels
}
source.getSearchCapabilities = function() {
    return new ResultCapabilities([], [], [])
}
source.search = function(_query: string, _type: any | null, _order: any | null, _filters: any): ContentPager {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException("login to search")
    }

    const url = new URL(SEARCH_URL)
    url.searchParams.set("q", _query)
    url.searchParams.set("limit", "50")

    const response: SearchResponse = JSON.parse(local_http.GET(url.toString(), getAuthHeaders(), true).body)

    const results = response.blogPosts.map(create_platform_video_from_search).filter(x => x !== null)

    return new SearchPager(response, results, {})
}
source.isChannelUrl = function(url: string): boolean {
    return CHANNEL_URL_PATTERN.test(url)
}
source.getChannel = function(channelUrl: string): PlatformChannel {
    const urlname = channelUrl.match(CHANNEL_URL_PATTERN)?.[0]?.split("/").pop() ?? ""

    if (!urlname) {
        throw new ScriptException(`Invalid channel URL: ${channelUrl}`)
    }

    const api_url = new URL(`${BASE_API_URL}/v3/creator/named`)
    api_url.searchParams.set("creatorURL", urlname)

    try {
        const response = JSON.parse(local_http.GET(api_url.toString(), getAuthHeaders(), true).body)

        const creator = Array.isArray(response) ? response[0] : response
        if (creator?.id) {
            return new PlatformChannel({
                id: new PlatformID(PLATFORM, creator.id, plugin.config.id),
                name: creator.title,
                thumbnail: creator.icon?.path ?? "",
                banner: creator.cover?.path ?? "",
                subscribers: -1,
                description: creator.description,
                url: `${PLATFORM_URL}/channel/${creator.urlname}`,
                links: {}
            })
        }
    } catch (e) {
        throw new ScriptException(`Failed to get channel info for ${urlname}: ${String(e)}`)
    }

    throw new ScriptException(`Channel not found: ${urlname}`)
}
source.getChannelCapabilities = function() {
    return new ResultCapabilities([], [], [])
}
source.getChannelContents = function(channelUrl: string, _type: any | null, _order: any | null, _filters: any): ContentPager {
    const urlname = channelUrl.match(CHANNEL_URL_PATTERN)?.[0]?.split("/").pop() ?? ""
    if (!urlname) {
        return new ContentPager([], false)
    }

    // Look up creator ID from URL name
    const namedUrl = new URL(`${BASE_API_URL}/v3/creator/named`)
    namedUrl.searchParams.set("creatorURL", urlname)

    try {
        const creatorResponse = JSON.parse(local_http.GET(namedUrl.toString(), getAuthHeaders(), true).body)
        const creator = Array.isArray(creatorResponse) ? creatorResponse[0] : creatorResponse
        if (!creator?.id) {
            return new ContentPager([], false)
        }

        const listUrl = new URL(LIST_URL)
        listUrl.searchParams.set("limit", "20")
        listUrl.searchParams.set("ids[0]", creator.id)

        const response: CreatorVideosResponse = JSON.parse(local_http.GET(listUrl.toString(), getAuthHeaders(), true).body)
        const results = response.blogPosts.map(create_platform_video).filter(x => x !== null)
        const hasMore = response.lastElements.some(e => e.moreFetchable)

        return new ChannelContentPager(creator.id, response.lastElements, results, hasMore)
    } catch (e) {
        log(`Failed to get channel contents for ${urlname}: ${String(e)}`)
        return new ContentPager([], false)
    }
}
//#endregion

//#region home
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

        const response: CreatorVideosResponse = JSON.parse(local_http.GET(url.toString(), getAuthHeaders(), true).body)

        const creators: Record<string, CreatorStatus> = {}
        let has_more = false
        for (const data of response.lastElements) {
            creators[data.creatorId] = data
            has_more ||= data.moreFetchable
        }

        // Check for livestreams from subscribed creators
        const livestreams: PlatformVideo[] = []
        for (const post of response.blogPosts) {
            if (post.creator.liveStream && !post.creator.liveStream.offline) {
                livestreams.push(new PlatformVideo({
                    id: new PlatformID(PLATFORM, post.creator.liveStream.id, plugin.config.id),
                    name: `[LIVE] ${post.creator.liveStream.title}`,
                    thumbnails: new Thumbnails([new Thumbnail(post.creator.liveStream.thumbnail?.path ?? "", 0)]),
                    author: new PlatformAuthorLink(
                        new PlatformID(PLATFORM, post.creator.id, plugin.config.id),
                        post.creator.title,
                        `${PLATFORM_URL}/channel/${post.creator.urlname}`,
                        post.creator.icon?.path ?? ""
                    ),
                    datetime: Date.now() / 1000,
                    duration: 0,
                    viewCount: 0,
                    url: `${PLATFORM_URL}/live/${post.creator.urlname}?id=${post.creator.liveStream.id}`,
                    shareUrl: `${PLATFORM_URL}/live/${post.creator.urlname}?id=${post.creator.liveStream.id}`,
                    isLive: true
                }))
            }
        }

        const videoResults = response.blogPosts.map(create_platform_video).filter(x => x !== null)
        const results = [...livestreams, ...videoResults]

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

        const response: CreatorVideosResponse = JSON.parse(local_http.GET(url.toString(), getAuthHeaders(), true).body)

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

class ChannelContentPager extends ContentPager {
    private lastElements: CreatorStatus[]
    constructor(
        private readonly creatorId: string,
        lastElements: CreatorStatus[],
        results: PlatformVideo[],
        hasMore: boolean
    ) {
        super(results, hasMore)
        this.lastElements = lastElements
    }
    override nextPage(this: ChannelContentPager) {
        const url = new URL(LIST_URL)
        url.searchParams.set("limit", "20")
        url.searchParams.set("ids[0]", this.creatorId)

        const lastEl = this.lastElements.find(e => e.creatorId === this.creatorId)
        if (lastEl?.blogPostId) {
            url.searchParams.set("fetchAfter[0][creatorId]", this.creatorId)
            url.searchParams.set("fetchAfter[0][blogPostId]", lastEl.blogPostId)
            url.searchParams.set("fetchAfter[0][moreFetchable]", lastEl.moreFetchable.toString())
        }

        const response: CreatorVideosResponse = JSON.parse(local_http.GET(url.toString(), getAuthHeaders(), true).body)
        this.lastElements = response.lastElements
        this.hasMore = response.lastElements.some(e => e.moreFetchable)
        this.results = response.blogPosts.map(create_platform_video).filter(x => x !== null)
        return this
    }
    override hasMorePagers(this: ChannelContentPager): boolean {
        return this.hasMore
    }
}
//#endregion

//#region 
class FloatplaneCommentPager extends ContentPager {
    private fetchAfter: string | null = null
    override results: PlatformComment[]

    constructor(private postId: string, private limit: number) {
        const url = new URL(COMMENTS_URL)
        url.searchParams.set("blogPost", postId)
        url.searchParams.set("limit", limit.toString())

        const response = JSON.parse(local_http.GET(url.toString(), getAuthHeaders(), true).body) as CommentResponse[]
        const results = response.map(comment => FloatplaneCommentPager.createPlatformComment(postId, comment))

        super(results, response.length === limit)
        this.results = results
        if (response.length > 0) {
            this.fetchAfter = response[response.length - 1]?.id ?? ""
        }
    }

    override nextPage(): FloatplaneCommentPager {
        if (!this.fetchAfter) return this

        const url = new URL(COMMENTS_URL)
        url.searchParams.set("blogPost", this.postId)
        url.searchParams.set("limit", this.limit.toString())
        url.searchParams.set("fetchAfter", this.fetchAfter)

        const response = JSON.parse(local_http.GET(url.toString(), getAuthHeaders(), true).body) as CommentResponse[]
        const results = response.map(comment => FloatplaneCommentPager.createPlatformComment(this.postId, comment))

        this.hasMore = response.length === this.limit
        this.results = results
        if (response.length > 0) {
            this.fetchAfter = response[response.length - 1]?.id ?? ""
        }

        return this
    }

    private static createPlatformComment(postId: string, comment: CommentResponse): PlatformComment {
        return new PlatformComment({
            contextUrl: `${PLATFORM_URL}/post/${postId}`,
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, comment.user.id, plugin.config.id),
                comment.user.username,
                `${PLATFORM_URL}/user/${comment.user.id}`,
                comment.user.profileImage?.path ?? ""
            ),
            message: comment.text,
            date: new Date(comment.postDate).getTime() / 1000,
            rating: new RatingLikesDislikes(comment.likes, comment.dislikes),
            replyCount: comment.totalReplies,
            getReplies: () => new CommentPager([], false)
        })
    }
}

class SearchPager extends ContentPager {
    private response: SearchResponse

    constructor(response: SearchResponse, initialResults: PlatformVideo[], _filter: unknown) {
        super(initialResults, false)
        this.response = response
    }

    override nextPage(): SearchPager {
        const url = new URL(SEARCH_URL)
        url.searchParams.set("q", "")
        url.searchParams.set("limit", "50")

        let has_more = false

        this.response.creators.forEach((creator) => {
            url.searchParams.set(`creators[${has_more.toString()}]`, creator.id)
            has_more = true
        })

        this.response.blogPosts.forEach((post) => {
            url.searchParams.set(`blogPosts[${has_more.toString()}]`, post.id)
            has_more = true
        })

        this.response = JSON.parse(local_http.GET(url.toString(), getAuthHeaders(), true).body) as SearchResponse
        this.results = this.response.blogPosts.map(create_platform_video_from_search).filter(x => x !== null)
        this.hasMore = has_more

        return this
    }
}

function create_platform_video_from_search(blog: SearchBlogPost): PlatformVideo | null {
    if (!blog.thumbnail) {
        return null
    }

    return new PlatformVideo({
        id: new PlatformID("Floatplane", blog.id, plugin.config.id),
        name: blog.title,
        thumbnails: new Thumbnails([blog.thumbnail].map(
            (t) => new Thumbnail(t.path, t.height)
        )),
        author: new PlatformAuthorLink(
            new PlatformID("Floatplane", blog.creator.id, plugin.config.id),
            blog.creator.title,
            PLATFORM_URL + "/channel/" + blog.creator.urlname,
            blog.creator.icon?.path ?? ""
        ),
        datetime: 0,
        duration: 0,
        viewCount: 0,
        url: PLATFORM_URL + "/post/" + blog.id,
        shareUrl: PLATFORM_URL + "/post/" + blog.id,
        isLive: false
    })
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
                url: `${origin}${variant.url}`,
                ...(local_state.client_id ? {
                    requestModifier: {
                        options: {
                            applyAuthClient: local_state.client_id
                        }
                    }
                } : {})
            })
        case "hls.fmp4":
            return new HLSSource({
                name: variant.label,
                url: `${origin}${variant.url}`,
                duration,
                priority: true,
                language: Language.UNKNOWN,
                ...(local_state.client_id ? {
                    requestModifier: {
                        options: {
                            applyAuthClient: local_state.client_id
                        }
                    }
                } : {})
            })
        case "hls.mpegts":
            return new HLSSource({
                name: variant.label,
                url: `${origin}${variant.url}`,
                duration,
                priority: false,
                language: Language.UNKNOWN,
                ...(local_state.client_id ? {
                    requestModifier: {
                        options: {
                            applyAuthClient: local_state.client_id
                        }
                    }
                } : {})
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
        const response: Delivery = JSON.parse(local_http.GET(url.toString(), { ...getAuthHeaders(), accept: "application/json" }, true).body)
        const streamSources = response.groups.flatMap((group) => {
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

        // If already using flat format, streaming sources are downloadable
        if (media_type === "flat") return streamSources

        // Also fetch flat MP4 download sources alongside HLS.
        // HLS downloads fail because the encrypted key URL (/api/video/watchKey)
        // returns HTTP 403 in Grayjay's download worker.
        // Flat MP4 URLs are directly downloadable.
        try {
            const dlUrl = new URL(DELIVERY_URL)
            dlUrl.searchParams.set("scenario", "download")
            dlUrl.searchParams.set("entityId", video.id)
            dlUrl.searchParams.set("outputKind", "flat")

            const dlResponse: Delivery = JSON.parse(local_http.GET(dlUrl.toString(), { ...getAuthHeaders(), accept: "application/json" }, true).body)
            const dlSources = dlResponse.groups.flatMap((group) => {
                return group.variants.filter(v => v.enabled).map((variant) => {
                    const origin = group.origins[0]
                    if (origin === undefined) {
                        throw new ScriptException("unreachable")
                    }

                    return create_video_source(
                        video.duration,
                        origin.url,
                        variant,
                        "flat"
                    )
                })
            })

            return [...streamSources, ...dlSources]
        } catch (e) {
            // Download may be disabled by the video uploader
            log(`Download sources unavailable for ${video.id}: ${String(e)}`)
            return streamSources
        }
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

console.log(milliseconds_to_WebVTT_timestamp, HARDCODED_EMPTY_STRING, EMPTY_AUTHOR())
// export statements are removed during build step
// used for unit testing in script.test.ts
export { milliseconds_to_WebVTT_timestamp }
