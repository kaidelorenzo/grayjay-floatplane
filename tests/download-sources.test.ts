//#region imports
import { describe, test } from "node:test"
import assert from "node:assert"
// initializes global state
import "@kaidelorenzo/grayjay-polyfill"
// replaces polyfill http/bridge and injects missing grayjay classes;
// must be imported before script.js so the plugin captures the mocks
import {
    LONG_LIVED_FLAT_ORIGIN,
    MockHLSSource,
    MockVideoUrlSource,
    TEST_CLIENT_ID,
    VIDEO_ATTACHMENT_ID,
    VIDEO_DURATION,
    created_descriptors,
    created_hls_sources,
    created_video_url_sources,
    requested_urls,
    reset_mock_state
} from "./grayjay-mocks.js"
// initializes source object using the mocked globals
import "../src/script.js"
import { StreamFormat, type Settings } from "../src/types.js"
//#endregion

const POST_URL = "https://www.floatplane.com/post/Tuxd9rAehl"

function get_content_details(settings: Settings) {
    if (source.enable === undefined || source.getContentDetails === undefined) {
        throw new Error("Missing enable or getContentDetails method")
    }
    reset_mock_state()
    source.enable({ id: "test-config" }, settings, null)
    return source.getContentDetails(POST_URL)
}

// Regression test for long-video downloads failing and retrying forever.
//
// Floatplane's scenario=download delivery URLs carry tokens that expire
// 60 seconds after issuance, enforced per request. Grayjay downloads flat
// MP4s through thousands of separate ranged requests, so any video whose
// download takes longer than 60 seconds fails with HTTP 403 partway
// through and restarts from scratch indefinitely. scenario=onDemand
// serves the byte-identical MP4 with a 6 hour JWT, so download sources
// must only ever come from scenario=onDemand.
await Promise.allSettled([describe("download sources", { skip: false }, async () => {
    await Promise.allSettled([
        test("long video download sources use long-lived onDemand urls", { skip: false }, () => {
            get_content_details({ stream_format: StreamFormat.HLS, log_toasts: false })

            // the 60 second token scenario must never be requested, and the
            // download request must ask for flat MP4s, not HLS playlists
            const deliveries = requested_urls
                .map(url => new URL(url))
                .filter(url => url.pathname === "/api/v3/delivery/info")
            assert.deepStrictEqual(
                deliveries.map(url => ({
                    scenario: url.searchParams.get("scenario"),
                    outputKind: url.searchParams.get("outputKind")
                })),
                [
                    { scenario: "onDemand", outputKind: "hls.fmp4" },
                    { scenario: "onDemand", outputKind: "flat" }
                ],
                "download URLs from scenario=download expire after 60 seconds; long videos cannot finish downloading before expiry"
            )

            // flat MP4 download sources must be the long-lived onDemand
            // variants, with disabled variants excluded
            assert.strictEqual(created_video_url_sources.length, 2, "expected exactly the two enabled flat variants")
            for (const def of created_video_url_sources) {
                assert.ok(
                    def.url.startsWith(`${LONG_LIVED_FLAT_ORIGIN}/Videos/${VIDEO_ATTACHMENT_ID}/`),
                    `flat source url must come from origins[0] of the onDemand delivery response, got: ${def.url}`
                )
                assert.match(def.url, /\.mp4\?token=LONG_LIVED_JWT/, "flat source must be a direct MP4 with the long-lived token")
                assert.strictEqual(def.container, "video/mp4")
                assert.strictEqual(def.duration, VIDEO_DURATION)
                assert.strictEqual(def.requestModifier?.options?.applyAuthClient, TEST_CLIENT_ID)
            }

            // streaming sources must keep their auth modifier: Grayjay's HLS
            // download path already loses it (see create_video_descriptor),
            // losing it on playback too would break every stream
            assert.strictEqual(created_hls_sources.length, 2)
            for (const def of created_hls_sources) {
                assert.match(def.url, /playlist_fmp4\.m3u8\?token=LONG_LIVED_JWT/)
                assert.strictEqual(def.duration, VIDEO_DURATION)
                assert.strictEqual(def.requestModifier?.options?.applyAuthClient, TEST_CLIENT_ID)
            }

            // flat sources must precede HLS sources so Grayjay's download
            // selector picks the flat MP4 (HLS downloads fail, see
            // create_video_descriptor)
            assert.strictEqual(created_descriptors.length, 1)
            const descriptor_sources = created_descriptors[0]
            assert.ok(descriptor_sources !== undefined)
            assert.deepStrictEqual(
                descriptor_sources.map(source_entry => {
                    if (source_entry instanceof MockVideoUrlSource) return "flat"
                    if (source_entry instanceof MockHLSSource) return "hls"
                    return "unknown"
                }),
                ["flat", "flat", "hls", "hls"]
            )
        }),
        test("flat MP4 setting excludes disabled variants from streaming sources", { skip: false }, () => {
            get_content_details({ stream_format: StreamFormat.FlatMP4, log_toasts: false })

            // single delivery request: streaming sources double as downloads
            const deliveries = requested_urls
                .map(url => new URL(url))
                .filter(url => url.pathname === "/api/v3/delivery/info")
            assert.deepStrictEqual(
                deliveries.map(url => ({
                    scenario: url.searchParams.get("scenario"),
                    outputKind: url.searchParams.get("outputKind")
                })),
                [{ scenario: "onDemand", outputKind: "flat" }]
            )

            // the disabled 2160p variant must not become a selectable source
            assert.strictEqual(created_video_url_sources.length, 2, "expected exactly the two enabled flat variants")
            for (const def of created_video_url_sources) {
                assert.doesNotMatch(def.url, /2160/, "disabled variants must be excluded from streaming sources")
                assert.match(def.url, /\.mp4\?token=LONG_LIVED_JWT/)
            }
            assert.strictEqual(created_descriptors.length, 1)
            assert.strictEqual(created_descriptors[0]?.length, 2)
            assert.strictEqual(created_hls_sources.length, 0)
        })
    ])
})])
