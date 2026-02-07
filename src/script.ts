//#region constants
import {
    CommentReply,
    CommentResponse,
    CreatorInfoResponse,
    CreatorStatus,
    CreatorVideosResponse,
    Delivery,
    DeliveryVariant,
    FloatplaneSource,
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
const COMMENT_REPLIES_URL = `${BASE_API_URL}/v3/comment/replies` as const
const SEARCH_URL = `${BASE_API_URL}/v3/search` as const
const CREATOR_NAMED_URL = `${BASE_API_URL}/v3/creator/named` as const
const CREATOR_INFO_URL = `${BASE_API_URL}/v3/creator/info` as const
const CHANNEL_URL_REGEX = /^https?:\/\/(?:www\.)?floatplane\.com\/channel\/([\w-]+)/i
const POST_URL_REGEX = /^https?:\/\/(?:www\.)?floatplane\.com\/post\/([\w\d]+)$/

const HARDCODED_ZERO = 0

// this API reference makes everything super easy
// https://jman012.github.io/FloatplaneAPIDocs/SwaggerUI-full/

const local_http = http
// const local_utility = utility

let local_settings: Settings

/** State */
let local_state: State

function post_url(postId: string): string {
    return `${PLATFORM_URL}/post/${postId}`
}
function channel_url(urlname: string): string {
    return `${PLATFORM_URL}/channel/${urlname}`
}
function user_url(userId: string): string {
    return `${PLATFORM_URL}/user/${userId}`
}

//#endregion

//#region source methods
const local_source: FloatplaneSource = {
    enable,
    disable,
    saveState,
    getHome,
    isContentDetailsUrl,
    getContentDetails,
    getComments,
    getUserSubscriptions,
    getSearchCapabilities,
    search,
    isChannelUrl,
    getChannel,
    getChannelCapabilities,
    getChannelContents,
}
init_source(local_source)
function init_source<
    ChannelTypes extends never,
    SearchTypes extends never,
    ChannelSearchTypes extends never
>(local_source: Source<never, never, never[], never, ChannelTypes, SearchTypes, ChannelSearchTypes, Settings>) {
    for (const method_key of Object.keys(local_source)) {
        // @ts-expect-error assign to readonly constant source object
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        source[method_key] = local_source[method_key]
    }
}
//#endregion

//#region enable
function enable(_conf: SourceConfig, settings: Settings, saved_state?: string | null) {
    local_settings = settings

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
function disable() {
    log(`${PLATFORM} log: disabling`)
}
function saveState() {
    return JSON.stringify(local_state)
}
//#endregion

//#region home
function getHome(): ContentPager {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException(`login to watch ${PLATFORM}`)
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: SubscriptionResponse[] = JSON.parse(local_http.GET(SUBSCRIPTIONS_URL, { "User-Agent": USER_AGENT }, true).body)

    const limit = 20
    const pager = new HomePager(response.map(c => c.creator), limit)
    return pager
}
//#endregion

//#region creator
function isChannelUrl(url: string): boolean {
    return CHANNEL_URL_REGEX.test(url)
}
function getChannel(channelUrl: string): PlatformChannel {
    const urlname = channelUrl.match(CHANNEL_URL_REGEX)?.[1]
    if (!urlname) {
        throw new ScriptException(`Invalid channel URL: ${channelUrl}`)
    }

    const api_url = new URL(CREATOR_NAMED_URL)
    api_url.searchParams.set("creatorURL", urlname)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: CreatorInfoResponse | CreatorInfoResponse[] = JSON.parse(local_http.GET(api_url.toString(), { "User-Agent": USER_AGENT }, true).body)
    const creator = Array.isArray(response) ? response[0] : response
    if (!creator?.id) {
        throw new ScriptException(`Channel not found: ${urlname}`)
    }

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, creator.id, plugin.config.id),
        name: creator.title,
        thumbnail: creator.icon?.path ?? "",
        banner: creator.cover?.path ?? "",
        subscribers: -1,
        description: creator.description,
        url: channel_url(creator.urlname),
        links: {}
    })
}
function getChannelCapabilities() {
    return new ResultCapabilities([], [], [])
}
function getChannelContents(channelUrl: string, _type: unknown, _order: unknown, _filters: unknown): ContentPager {
    const urlname = channelUrl.match(CHANNEL_URL_REGEX)?.[1]
    if (!urlname) {
        return new ContentPager([], false)
    }

    // Look up creator ID from URL name
    const namedUrl = new URL(CREATOR_NAMED_URL)
    namedUrl.searchParams.set("creatorURL", urlname)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const creatorResponse: CreatorInfoResponse | CreatorInfoResponse[] = JSON.parse(local_http.GET(namedUrl.toString(), { "User-Agent": USER_AGENT }, true).body)
    const creator = Array.isArray(creatorResponse) ? creatorResponse[0] : creatorResponse
    if (!creator?.id) {
        return new ContentPager([], false)
    }

    const listUrl = new URL(LIST_URL)
    listUrl.searchParams.set("limit", "20")
    listUrl.searchParams.set("ids[0]", creator.id)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: CreatorVideosResponse = JSON.parse(local_http.GET(listUrl.toString(), { "User-Agent": USER_AGENT }, true).body)
    const results = response.blogPosts.map(create_platform_video).filter(x => x !== null)
    const hasMore = response.lastElements.some(e => e.moreFetchable)

    return new ChannelContentPager(creator.id, response.lastElements, results, hasMore)
}
//#endregion

//#region user
function getUserSubscriptions(): string[] {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException("login to import subscriptions")
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: SubscriptionResponse[] = JSON.parse(
        local_http.GET(SUBSCRIPTIONS_URL, { "User-Agent": USER_AGENT }, true).body
    )

    const channels: string[] = []

    for (const sub of response) {
        const creatorUrl = new URL(CREATOR_INFO_URL)
        creatorUrl.searchParams.set("id", sub.creator)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const creator: CreatorInfoResponse = JSON.parse(
            local_http.GET(creatorUrl.toString(), { "User-Agent": USER_AGENT }, true).body
        )

        channels.push(channel_url(creator.urlname))
    }

    return channels
}
//#endregion

//#region search
function getSearchCapabilities() {
    return new ResultCapabilities([], [], [])
}
function search(query: string, _type: unknown, _order: unknown, _filters: unknown): ContentPager {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException("login to search")
    }

    const url = new URL(SEARCH_URL)
    url.searchParams.set("q", query)
    url.searchParams.set("limit", "50")

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: SearchResponse = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT }, true).body)

    const results = response.blogPosts.map(create_platform_video_from_search).filter(x => x !== null)

    return new SearchPager(response, results, {})
}
//#endregion

//#region comments
function getComments(url: string): CommentPager {
    const post_id = url.match(POST_URL_REGEX)?.[1]
    if (!post_id) {
        throw new ScriptException("Invalid URL")
    }
    return new FloatplaneCommentPager(post_id, 20)
}
//#endregion

//#region content
function isContentDetailsUrl(url: string) {
    return POST_URL_REGEX.test(url)
}
function getContentDetails(url: string): PlatformContentDetails {
    if (!bridge.isLoggedIn()) {
        throw new LoginRequiredException(`login to watch ${PLATFORM}`)
    }
    const post_id = url.match(POST_URL_REGEX)?.[1]
    if (!post_id) {
        throw new ScriptException(`Invalid post URL: ${url}`)
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
              new PlatformID(PLATFORM, `${response.channel.creator}:${response.channel.id}`, plugin.config.id),
                response.channel.title,
                ChannelUrlFromBlog(response),
                response.channel.icon?.path ?? ""
            ),
            datetime: new Date(response.releaseDate).getTime() / 1000,
            duration: response.metadata.videoDuration,
            viewCount: HARDCODED_ZERO,
            url: post_url(response.id),
            shareUrl: post_url(response.id),
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
            id: new PlatformID(PLATFORM, blog.id, plugin.config.id),
            name: blog.title,
            thumbnails: create_thumbnails(blog.thumbnail),
            author: new PlatformAuthorLink(
              new PlatformID(PLATFORM, `${blog.channel.creator}:${blog.channel.id}`, plugin.config.id),
                blog.channel.title,
                ChannelUrlFromBlog(blog),
                blog.channel.icon?.path ?? ""
            ),
            datetime: new Date(blog.releaseDate).getTime() / 1000,
            duration: blog.metadata.videoDuration,
            viewCount: 0,
            url: post_url(blog.id),
            shareUrl: post_url(blog.id),
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
  return `${PLATFORM_URL}/channel/${blog.creator.urlname}/home/${blog.channel.urlname}`
}

class HomePager extends ContentPager {
    private readonly creators: Record<string, CreatorStatus>
    constructor(creator_ids: string[], private readonly limit: number) {
        const url = new URL(LIST_URL)
        url.searchParams.set("limit", limit.toString())
        creator_ids.forEach((creator_id, index) => { url.searchParams.set(`ids[${index.toString()}]`, creator_id) })

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CreatorVideosResponse = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT }, true).body)

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
                const liveStreamUrl = `${PLATFORM_URL}/live/${post.creator.urlname}?id=${post.creator.liveStream.id}`
                livestreams.push(new PlatformVideo({
                    id: new PlatformID(PLATFORM, post.creator.liveStream.id, plugin.config.id),
                    name: `[LIVE] ${post.creator.liveStream.title}`,
                    thumbnails: new Thumbnails([new Thumbnail(post.creator.liveStream.thumbnail?.path ?? "", 0)]),
                    author: new PlatformAuthorLink(
                        new PlatformID(PLATFORM, post.creator.id, plugin.config.id),
                        post.creator.title,
                        channel_url(post.creator.urlname),
                        post.creator.icon?.path ?? ""
                    ),
                    datetime: Date.now() / 1000,
                    duration: 0,
                    viewCount: 0,
                    url: liveStreamUrl,
                    shareUrl: liveStreamUrl,
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CreatorVideosResponse = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT }, true).body)

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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CreatorVideosResponse = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT }, true).body)
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

//#region comment pagers
class FloatplaneCommentPager extends ContentPager {
    private fetchAfter: string | null = null
    override results: PlatformComment[]

    constructor(private postId: string, private limit: number) {
        const url = new URL(COMMENTS_URL)
        url.searchParams.set("blogPost", postId)
        url.searchParams.set("limit", limit.toString())

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CommentResponse[] = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT }, true).body)
        const results = response.map(comment => FloatplaneCommentPager.createPlatformComment(postId, comment))

        super(results, response.length === limit)
        this.results = results
        if (response.length > 0) {
            this.fetchAfter = response[response.length - 1]?.id ?? ""
        }
    }

    override nextPage(this: FloatplaneCommentPager) {
        if (!this.fetchAfter) return this

        const url = new URL(COMMENTS_URL)
        url.searchParams.set("blogPost", this.postId)
        url.searchParams.set("limit", this.limit.toString())
        url.searchParams.set("fetchAfter", this.fetchAfter)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CommentResponse[] = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT }, true).body)
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
            contextUrl: post_url(postId),
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, comment.user.id, plugin.config.id),
                comment.user.username,
                user_url(comment.user.id),
                comment.user.profileImage.path
            ),
            message: comment.text,
            date: new Date(comment.postDate).getTime() / 1000,
            rating: new RatingLikesDislikes(comment.likes, comment.dislikes),
            replyCount: comment.totalReplies,
            getReplies: () => new FloatplaneReplyPager(postId, comment.id, 20)
        })
    }
}

class FloatplaneReplyPager extends CommentPager {
    private lastReplyId: string | null = null

    constructor(private postId: string, private commentId: string, private limit: number) {
        const url = new URL(COMMENT_REPLIES_URL)
        url.searchParams.set("comment", commentId)
        url.searchParams.set("blogPost", postId)
        url.searchParams.set("limit", limit.toString())

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CommentReply[] = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT }, true).body)
        const results = response.map(reply => FloatplaneReplyPager.createReplyComment(postId, reply))

        super(results, response.length === limit)
        if (response.length > 0) {
            this.lastReplyId = response[response.length - 1]?.id ?? null
        }
    }

    override nextPage(this: FloatplaneReplyPager) {
        if (!this.lastReplyId) return this

        const url = new URL(COMMENT_REPLIES_URL)
        url.searchParams.set("comment", this.commentId)
        url.searchParams.set("blogPost", this.postId)
        url.searchParams.set("limit", this.limit.toString())
        url.searchParams.set("rid", this.lastReplyId)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const response: CommentReply[] = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT }, true).body)
        const results = response.map(reply => FloatplaneReplyPager.createReplyComment(this.postId, reply))

        this.hasMore = response.length === this.limit
        this.results = results
        if (response.length > 0) {
            this.lastReplyId = response[response.length - 1]?.id ?? null
        }

        return this
    }

    private static createReplyComment(postId: string, reply: CommentReply): PlatformComment {
        return new PlatformComment({
            contextUrl: post_url(postId),
            author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, reply.user.id, plugin.config.id),
                reply.user.username,
                user_url(reply.user.id),
                reply.user.profileImage.path
            ),
            message: reply.text,
            date: new Date(reply.postDate).getTime() / 1000,
            rating: new RatingLikesDislikes(reply.likes, reply.dislikes),
            replyCount: 0,
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

    override nextPage(this: SearchPager) {
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        this.response = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT }, true).body)
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
        id: new PlatformID(PLATFORM, blog.id, plugin.config.id),
        name: blog.title,
        thumbnails: new Thumbnails([blog.thumbnail].map(
            (t) => new Thumbnail(t.path, t.height)
        )),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, blog.creator.id, plugin.config.id),
            blog.creator.title,
            channel_url(blog.creator.urlname),
            blog.creator.icon?.path ?? ""
        ),
        datetime: 0,
        duration: 0,
        viewCount: 0,
        url: post_url(blog.id),
        shareUrl: post_url(blog.id),
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
                requestModifier: {
                    options: {
                        applyAuthClient: local_state.client_id
                    }
                }
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
        const response: Delivery = JSON.parse(local_http.GET(url.toString(), { "User-Agent": USER_AGENT, accept: "application/json" }, true).body)
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
        const dlUrl = new URL(DELIVERY_URL)
        dlUrl.searchParams.set("scenario", "download")
        dlUrl.searchParams.set("entityId", video.id)
        dlUrl.searchParams.set("outputKind", "flat")

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const dlResponse: Delivery = JSON.parse(local_http.GET(dlUrl.toString(), { "User-Agent": USER_AGENT, accept: "application/json" }, true).body)
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
    log([`${PLATFORM} log:`, value])
    if (exception_message !== undefined) {
        return new ScriptException(exception_message)
    }
    return
}
//#endregion

console.log(milliseconds_to_WebVTT_timestamp)
// export statements are removed during build step
// used for unit testing in script.test.ts
export { milliseconds_to_WebVTT_timestamp }
