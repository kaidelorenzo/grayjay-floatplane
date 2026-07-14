//#region grayjay mock environment
// Replaces the polyfill's http/bridge globals and injects the grayjay
// classes the polyfill does not implement. Import this module AFTER
// @kaidelorenzo/grayjay-polyfill and BEFORE src/script.js so the plugin
// captures the mocked globals at load time.
import type { Delivery } from "../src/types.js"

// Fail fast on import order violations: a misordered import would make
// the polyfill's sync-fetch http issue live requests to floatplane.com.
if (!("source" in globalThis)) {
    throw new Error("grayjay-mocks must be imported after @kaidelorenzo/grayjay-polyfill")
}
if (source.enable !== undefined) {
    throw new Error("grayjay-mocks must be imported before src/script.js")
}

export const TEST_CLIENT_ID = "test-client-id"
export const POST_ID = "Tuxd9rAehl"
export const VIDEO_ATTACHMENT_ID = "VoAGr7LOVl"
export const VIDEO_DURATION = 14128

/** origin used by scenario=onDemand deliveries (6 hour JWT tokens) */
export const LONG_LIVED_FLAT_ORIGIN = "https://cdn-vod-drm2.floatplane.com"
/** origin used by scenario=download deliveries (60 second tokens) */
export const SHORT_LIVED_DOWNLOAD_ORIGIN = "https://vod-download.floatplane.com"

export const requested_urls: string[] = []
export const created_video_url_sources: IVideoUrlSourceDef[] = []
export const created_hls_sources: IHLSSourceDef[] = []
export const created_descriptors: IVideoSource[][] = []

/** empties every spy array; call at the start of each test */
export function reset_mock_state() {
    requested_urls.length = 0
    created_video_url_sources.length = 0
    created_hls_sources.length = 0
    created_descriptors.length = 0
}

//#region fixtures
// Trimmed copies of real API responses for post Tuxd9rAehl
// (3h55m WAN Show VOD, 2.29 GB at 1080p).
const post_fixture = {
    id: POST_ID,
    title: "Livestream VOD - WAN Show July 10, 2026",
    text: "<p>fixture</p>",
    thumbnail: null,
    releaseDate: "2026-07-11T04:00:00.000Z",
    likes: 100,
    dislikes: 2,
    metadata: {
        hasVideo: true,
        hasAudio: false,
        hasPicture: false,
        hasGallery: false,
        videoDuration: VIDEO_DURATION
    },
    videoAttachments: [{ id: VIDEO_ATTACHMENT_ID, duration: VIDEO_DURATION }],
    creator: { urlname: "linustechtips" },
    channel: {
        creator: "59f94c0bdd241b70349eb72b",
        id: "6413534d88c13c181c3e2809",
        title: "The WAN Show",
        urlname: "wan",
        icon: null
    }
}

function delivery_variant(label: string, url: string, enabled: boolean, mime_type: string) {
    return {
        name: label,
        label,
        url,
        mimeType: mime_type,
        order: 111745216,
        hidden: false,
        enabled,
        meta: {
            video: {
                codec: "avc1.640028",
                codecSimple: "avc1",
                bitrate: { average: 1155310 },
                width: 1920,
                height: 1080,
                isHdr: false,
                fps: 30
                // meta.video.mimeType deliberately omitted: real flat
                // delivery responses do not carry it (hls responses do)
            }
        }
    }
}

const on_demand_hls_delivery_fixture = {
    groups: [{
        origins: [{ url: LONG_LIVED_FLAT_ORIGIN }],
        variants: [
            delivery_variant("720p", `/Videos/${VIDEO_ATTACHMENT_ID}/720.mp4/playlist_fmp4.m3u8?token=LONG_LIVED_JWT_720`, true, "application/x-mpegURL"),
            delivery_variant("1080p", `/Videos/${VIDEO_ATTACHMENT_ID}/1080.mp4/playlist_fmp4.m3u8?token=LONG_LIVED_JWT_1080`, true, "application/x-mpegURL")
        ]
    }]
} satisfies Delivery

// origins[1] is a decoy: the plugin must build sources from origins[0]
const on_demand_flat_delivery_fixture = {
    groups: [{
        origins: [{ url: LONG_LIVED_FLAT_ORIGIN }, { url: "https://cdn-vod-drm5.floatplane.com" }],
        variants: [
            delivery_variant("360p", `/Videos/${VIDEO_ATTACHMENT_ID}/360.mp4?token=LONG_LIVED_JWT_360`, true, "video/mp4"),
            delivery_variant("1080p", `/Videos/${VIDEO_ATTACHMENT_ID}/1080.mp4?token=LONG_LIVED_JWT_1080`, true, "video/mp4"),
            delivery_variant("2160p", `/Videos/${VIDEO_ATTACHMENT_ID}/2160.mp4?token=LONG_LIVED_JWT_2160`, false, "video/mp4")
        ]
    }]
} satisfies Delivery

// Served if the implementation regresses to scenario=download.
// These tokens expire 60 seconds after issuance, so Grayjay's chunked
// downloader can never finish a long video with them.
const download_delivery_fixture = {
    groups: [{
        origins: [{ url: SHORT_LIVED_DOWNLOAD_ORIGIN }],
        variants: [
            delivery_variant("360p", `/${VIDEO_ATTACHMENT_ID}/360.mp4?token=SHORT_LIVED_60S_360&expires=1784064169`, true, "video/mp4"),
            delivery_variant("1080p", `/${VIDEO_ATTACHMENT_ID}/1080.mp4?token=SHORT_LIVED_60S_1080&expires=1784064169`, true, "video/mp4")
        ]
    }]
} satisfies Delivery
//#endregion

//#region fake http
function respond(url: string, body: unknown): BridgeHttpResponse<string> {
    return { body: JSON.stringify(body), code: 200, headers: {}, url, isOk: true }
}

function fake_http_get(url: string, _headers: HTTPHeaders, _use_auth_client: boolean): BridgeHttpResponse<string> {
    requested_urls.push(url)
    const parsed = new URL(url)
    if (parsed.pathname === "/api/v3/content/post") {
        return respond(url, post_fixture)
    }
    if (parsed.pathname === "/api/v3/delivery/info") {
        const scenario = parsed.searchParams.get("scenario")
        const output_kind = parsed.searchParams.get("outputKind")
        if (scenario === "download") {
            return respond(url, download_delivery_fixture)
        }
        if (scenario === "onDemand" && output_kind === "flat") {
            return respond(url, on_demand_flat_delivery_fixture)
        }
        if (scenario === "onDemand" && (output_kind === "hls.fmp4" || output_kind === "hls.mpegts")) {
            return respond(url, on_demand_hls_delivery_fixture)
        }
    }
    // any unrecognized scenario/outputKind combination lands here
    throw new Error(`unexpected request in test: ${url}`)
}

const fake_http = {
    GET: fake_http_get,
    getDefaultClient: (_with_auth: boolean) => ({ clientId: TEST_CLIENT_ID })
}
// @ts-expect-error inject fake http into global scope for script.js
globalThis.http = fake_http
//#endregion

//#region fake bridge and classes
const fake_bridge: typeof bridge = {
    isLoggedIn: () => true,
    toast: (message: string) => { console.log(`Toast: ${message}`) },
    throwTest: (message: string) => { console.log(`Throw test: ${message}`) }
}
// @ts-expect-error inject fake bridge into global scope for script.js
globalThis.bridge = fake_bridge

export class MockVideoUrlSource {
    constructor(readonly def: IVideoUrlSourceDef) {
        created_video_url_sources.push(def)
    }
}
// @ts-expect-error inject mock class into global scope for script.js
globalThis.VideoUrlSource = MockVideoUrlSource

export class MockHLSSource {
    constructor(readonly def: IHLSSourceDef) {
        created_hls_sources.push(def)
    }
}
// @ts-expect-error inject mock class into global scope for script.js
globalThis.HLSSource = MockHLSSource

export class MockVideoSourceDescriptor {
    constructor(readonly videoSources: IVideoSource[]) {
        created_descriptors.push(videoSources)
    }
}
// @ts-expect-error inject mock class into global scope for script.js
globalThis.VideoSourceDescriptor = MockVideoSourceDescriptor

export class MockPlatformVideoDetails {
    constructor(readonly def: IPlatformVideoDetailsDef) { }
}
// @ts-expect-error inject mock class into global scope for script.js
globalThis.PlatformVideoDetails = MockPlatformVideoDetails

export class MockRatingLikesDislikes {
    constructor(readonly likes: number, readonly dislikes: number) { }
}
// @ts-expect-error inject mock class into global scope for script.js
globalThis.RatingLikesDislikes = MockRatingLikesDislikes

export class MockScriptException extends Error {
    constructor(type: string, msg?: string) {
        super(msg ?? type)
    }
}
// @ts-expect-error inject mock class into global scope for script.js
globalThis.ScriptException = MockScriptException

export class MockLoginRequiredException extends MockScriptException { }
// @ts-expect-error inject mock class into global scope for script.js
globalThis.LoginRequiredException = MockLoginRequiredException
//#endregion
//#endregion
