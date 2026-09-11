import { z } from 'zod'

export const youtubeMusicCandidateSchema = z
  .object({
    videoId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    artists: z.array(z.string().trim().min(1)).min(1),
    durationMs: z.number().int().positive(),
    albumName: z.string().trim().min(1).optional(),
    channelName: z.string().trim().min(1).optional(),
    isOfficial: z.boolean(),
    isOfficialArtistVideo: z.boolean().optional(),
    isTopic: z.boolean(),
  })
  .strict()

export const youtubeAudioFormatSchema = z
  .object({
    videoId: z.string().trim().min(1),
    streamUrl: z.url({ protocol: /^https?$/ }),
    mimeType: z.string().trim().min(1),
    bitrate: z.number().int().positive().optional(),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()

export const youtubeRawAudioFormatSchema = z
  .object({
    streamUrl: z.url({ protocol: /^https?$/ }),
    mimeType: z.string().trim().min(1),
    bitrate: z.number().int().positive().optional(),
    hasAudio: z.literal(true),
    hasVideo: z.boolean(),
    drmFamilies: z.array(z.string()).optional(),
  })
  .strict()

export type YouTubeMusicCandidate = z.infer<typeof youtubeMusicCandidateSchema>
export type YouTubeAudioFormat = z.infer<typeof youtubeAudioFormatSchema>
export type YouTubeRawAudioFormat = z.infer<typeof youtubeRawAudioFormatSchema>
