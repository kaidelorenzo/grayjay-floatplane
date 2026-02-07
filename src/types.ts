//#region custom types
export type FloatplaneSource = Required<Omit<
    Source<
        never, never, never[], never,
        never, never, never, Settings
    >,
    "searchSuggestions" | "getSubComments" | "getSearchChannelContentsCapabilities" | "getLiveChatWindow" | "searchChannelContents" | "searchChannels" | "isPlaylistUrl" | "getPlaylist" | "searchPlaylists" | "getChannelPlaylists" | "getPlaybackTracker" | "getUserPlaylists" | "getContentRecommendations" | "getShorts"
>>

export type Settings = {
    readonly stream_format: StreamFormat
    readonly log_toasts: boolean
}

export const enum StreamFormat {
    HLS = 0,
    LegacyHLS = 1,
    FlatMP4 = 2
}

export type State = {
    readonly client_id: string
}

export type MediaType = "hls.fmp4" | "hls.mpegts" | "flat"

export type CreatorInfoResponse = {
    readonly id: string
    readonly title: string
    readonly urlname: string
    readonly description: string
    readonly icon: ParentImage | null
    readonly cover: ParentImage | null
}
//#endregion

//#region JSON types
export type SubscriptionResponse = {
    readonly startDate: string
    readonly endDate: string
    readonly paymentID: number
    readonly interval: string
    readonly paymentCancelled: boolean
    readonly plan: SubscriptionPlans
    readonly creator: string
}
type Creator = {
    readonly id: string
    readonly owner: string
    readonly title: string
    readonly urlname: string
    readonly description: string
    readonly about: string
    readonly category: CreatorCategory | string
    readonly cover: ParentImage | null
    readonly icon: ParentImage | null
    readonly liveStream: LiveStream | null
    readonly subscriptionPlans: SubscriptionPlans[] | null
    readonly discoverable: boolean
    readonly subscriberCountDisplay: string
    readonly incomeDisplay: boolean
    readonly socialLinks?: object
}
type Channel = {
    readonly id: string
    readonly creator: string
    readonly title: string
    readonly urlname: string
    readonly about: string
    readonly order: number
    readonly cover: ParentImage | null
    readonly card: ParentImage | null
    readonly icon: ParentImage | null
}
type CreatorCategory = {
    readonly title: string
}
interface Image {
    readonly width: number
    readonly height: number
    readonly path: string
}
export interface ParentImage extends Image {
    readonly childImages: Image[]
}
type LiveStream = {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly thumbnail: ParentImage | null
    readonly owner: string
    readonly streamPath: string
    readonly offline: LiveStreamOffline | null
}
type LiveStreamOffline = {
    readonly title: string
    readonly description: string
    readonly thumbnail: ParentImage | null
}
type SubscriptionPlans = {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly price: string
    readonly priceYearly: string
    readonly currency: string
    readonly logo: ParentImage | null
    readonly interval: string
    readonly featured: boolean
    readonly allowGrandfatheredAccess: boolean
}
export type Post = {
    readonly id: string
    readonly guid: string
    readonly title: string
    readonly text: string
    readonly type: string
    readonly tags: string[]
    readonly attachmentOrder: string[]
    readonly metadata: PostMetadata
    readonly releaseDate: string
    readonly likes: number
    readonly dislikes: number
    readonly score: number
    readonly comments: number
    readonly creator: Creator
    readonly channel: Channel
    readonly wasReleasedSilently: boolean
    readonly thumbnail: ParentImage | null
    readonly isAccessible: boolean
    readonly videoAttachments: VideoAttachment[]
    readonly audioAttachments: AudioAttachment[]
    readonly pictureAttachments: PictureAttachment[]
    readonly galleryAttachments: GalleryAttachment[]
}
type PostMetadata = {
    readonly hasVideo: boolean
    readonly videoCount: number
    readonly videoDuration: number
    readonly hasAudio: boolean
    readonly audioCount: number
    readonly audioDuration: number
    readonly hasPicture: boolean
    readonly pictureCount: number
    readonly hasGallery: boolean
    readonly galleryCount: number
    readonly isFeatured: boolean
}
interface Attachment {
    readonly id: string
    readonly guid: string
    readonly title: string
    readonly type: string
    readonly description: string
    readonly creator: string
    readonly likes: number
    readonly dislikes: number
    readonly score: number
    readonly isProcessing: boolean
    readonly primaryBlogPost: string
    readonly isAccessible: boolean
}
export interface VideoAttachment extends Attachment {
    readonly type: "video"
    readonly duration: number
    readonly thumbnail: ParentImage | null
}
interface AudioAttachment extends Attachment {
    readonly type: "audio"
    readonly duration: number
    readonly waveform: AudioWaveform
}
interface PictureAttachment extends Attachment {
    readonly type: "picture"
}
interface GalleryAttachment extends Attachment {
    readonly type: "gallery"
}
type AudioWaveform = {
    readonly dataSetLength: number
    readonly highestValue: number
    readonly lowestValue: number
    readonly data: number[]
}
export type Delivery = {
    readonly groups: DeliveryGroup[]
}
type DeliveryGroup = {
    readonly origins: DeliveryOrigin[]
    readonly variants: DeliveryVariant[]
}
type DeliveryOrigin = {
    readonly url: string
}
export type DeliveryVariant = {
    readonly name: string
    readonly label: string
    readonly url: string
    readonly mimeType: string
    readonly order: number
    readonly hidden: boolean
    readonly enabled: boolean
    readonly meta: DeliveryMetadata
}
type DeliveryMetadata = {
    readonly video: DeliveryVideoMetadata
    readonly audio?: DeliveryAudioMetadata
}
type DeliveryVideoMetadata = {
    readonly codec: string
    readonly codecSimple: string
    readonly bitrate: MetadataBitrate
    readonly width: number
    readonly height: number
    readonly isHdr: boolean
    readonly fps: number
    readonly mimeType: string
}
type DeliveryAudioMetadata = {
    readonly codec: string
    readonly bitrate: MetadataBitrate
    readonly mimeType: string
    readonly channelCount: number
    readonly samplerate: number
}
type MetadataBitrate = {
    readonly average: number
    readonly maximum?: number
}
export type CreatorVideosResponse = {
    readonly lastElements: CreatorStatus[]
    readonly blogPosts: Post[]
}

export type CreatorStatus = {
    readonly moreFetchable: boolean
    readonly creatorId: string
    readonly blogPostId: string
}

export type SearchResponse = {
    readonly creators: SearchCreator[]
    readonly blogPosts: SearchBlogPost[]
}

export type SearchCreator = {
    readonly id: string
    readonly title: string
    readonly urlname: string
    readonly description: string
    readonly icon: ParentImage | null
}

export type SearchBlogPost = {
    readonly id: string
    readonly title: string
    readonly text: string
    readonly creator: SearchCreator
    readonly thumbnail: ParentImage | null
}

export type SearchCapabilities = {
    readonly creators: boolean
    readonly blogPosts: boolean
}

export type SearchFilter = {
    readonly creators?: boolean
    readonly blogPosts?: boolean
}
//#endregion

//#region Comments
export type CommentResponse = {
    readonly id: string
    readonly blogPost: string
    readonly user: CommentUser
    readonly text: string
    readonly replying: string
    readonly postDate: string
    readonly editDate: string
    readonly pinDate: string | null
    readonly editCount: number
    readonly isEdited: boolean
    readonly likes: number
    readonly dislikes: number
    readonly score: number
    readonly interactionCounts: InteractionCounts
    readonly totalReplies: number
    readonly replies: CommentReply[]
    readonly userInteraction: ("like" | "dislike")[]
}

export type CommentReply = {
    readonly id: string
    readonly blogPost: string
    readonly user: CommentUser
    readonly text: string
    readonly replying: string
    readonly postDate: string
    readonly editDate: string
    readonly pinDate: string | null
    readonly editCount: number
    readonly isEdited: boolean
    readonly likes: number
    readonly dislikes: number
    readonly score: number
    readonly interactionCounts: InteractionCounts
    readonly totalReplies: number
    readonly userInteraction: ("like" | "dislike")[]
}

type CommentUser = {
    readonly id: string
    readonly username: string
    readonly profileImage: ParentImage
}

type InteractionCounts = {
    readonly like: number
    readonly dislike: number
}
//#endregion
