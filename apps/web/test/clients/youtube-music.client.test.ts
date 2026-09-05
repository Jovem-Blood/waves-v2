import { describe, expect, it } from 'vitest'

import {
  hasOfficialMusicVideoEndpoint,
  selectYouTubeAudioFormat,
} from '../../server/clients/youtube-music.client'

describe('YouTube Music audio format selection', () => {
  it('recognizes the official artist video marker returned by YouTube Music', () => {
    expect(
      hasOfficialMusicVideoEndpoint({
        endpoint: {
          payload: {
            watchEndpointMusicSupportedConfigs: {
              watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_OMV' },
            },
          },
        },
      }),
    ).toBe(true)
    expect(
      hasOfficialMusicVideoEndpoint({
        endpoint: {
          payload: {
            watchEndpointMusicSupportedConfigs: {
              watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_UGC' },
            },
          },
        },
      }),
    ).toBe(false)
  })

  it('prefers audio-only Opus/WebM near the target bitrate', () => {
    const selected = selectYouTubeAudioFormat(
      'video-1',
      [
        {
          streamUrl: 'https://media.example/aac',
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          bitrate: 128_000,
          hasAudio: true,
          hasVideo: false,
        },
        {
          streamUrl: 'https://media.example/opus',
          mimeType: 'audio/webm; codecs="opus"',
          bitrate: 120_000,
          hasAudio: true,
          hasVideo: false,
        },
      ],
      Date.parse('2026-06-20T12:00:00.000Z'),
    )

    expect(selected).toMatchObject({
      videoId: 'video-1',
      streamUrl: 'https://media.example/opus',
    })
  })

  it('falls back to AAC/M4A and extracts signed URL expiry', () => {
    expect(
      selectYouTubeAudioFormat('video-1', [
        {
          streamUrl: 'https://media.example/aac?expire=1781957400',
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          hasAudio: true,
          hasVideo: false,
        },
      ]),
    ).toMatchObject({
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      expiresAt: '2026-06-20T12:10:00.000Z',
    })
  })

  it('uses a conservative TTL and rejects video or DRM formats', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z')
    expect(
      selectYouTubeAudioFormat(
        'video-1',
        [
          {
            streamUrl: 'https://media.example/drm',
            mimeType: 'audio/webm; codecs="opus"',
            hasAudio: true,
            hasVideo: false,
            drmFamilies: ['WIDEVINE'],
          },
          {
            streamUrl: 'https://media.example/video',
            mimeType: 'video/webm; codecs="vp9, opus"',
            hasAudio: true,
            hasVideo: true,
          },
        ],
        now,
      ),
    ).toBeUndefined()
    expect(
      selectYouTubeAudioFormat(
        'video-1',
        [
          {
            streamUrl: 'https://media.example/audio',
            mimeType: 'audio/webm; codecs="opus"',
            hasAudio: true,
            hasVideo: false,
          },
        ],
        now,
      )?.expiresAt,
    ).toBe('2026-06-20T12:05:00.000Z')
  })
})
