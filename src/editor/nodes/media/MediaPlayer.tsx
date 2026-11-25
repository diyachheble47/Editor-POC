// The video / audio player (Video.js packaged skins). Loaded lazily by MediaNode,
// so the player code and its stylesheets are only fetched once a document
// actually contains an uploaded video or audio file.

import '@videojs/react/video/skin.css'
import '@videojs/react/audio/skin.css'
import { Video, VideoPlayer, VideoSkin } from '@videojs/react/video'
import { Audio, AudioPlayer, AudioSkin } from '@videojs/react/audio'

export default function MediaPlayer({ kind, src }: { kind: 'video' | 'audio'; src: string }) {
  if (kind === 'audio') {
    return (
      <AudioPlayer>
        <AudioSkin className="media-skin-audio">
          <Audio src={src} preload="metadata" />
        </AudioSkin>
      </AudioPlayer>
    )
  }
  return (
    <VideoPlayer>
      <VideoSkin className="media-skin-video">
        <Video src={src} preload="metadata" playsInline />
      </VideoSkin>
    </VideoPlayer>
  )
}
