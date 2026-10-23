# Round O: optional MOV conversion

MOV input now has an explicit workflow rather than failing a codec assumption: configured authenticated media server, user-visible upload/fidelity consent, conversion, MP4 stored in local experience. With no configured service, no upload occurs and editor explains exporting MP4 instead.

Local integration proof (not a deployed backend): real editor UI in sandbox Chrome against localhost. Missing server gives message, cancel keeps zero elements, accept converts generated ProRes+PCM MOV to H264+AAC MP4. Stored video/mp4 is 20,920bytes, 160x120, 1s; decoded frame inspected. Unauthorized/missing token gets401, invalid media422, 121s input rejected. Reproducible core fixture test: node tests/mov-convert.cjs. Temp files absent after tests.

Bounds: 20MB input/output, 120s,4096px input sides,1920px output,30fps,H264 yuv420p,AAC stereo; metadata/chapters stripped. Frame-rate/downscale/color/transparency/audio conversion can reduce fidelity. Consent states this and exact destination. Token auth fail-closed, global API rate limit, one conversion at a time, ffmpeg/ffprobe child timeout90s, no shell, URL input or network protocol, drefs disabled.

Static staging rc33 contains the client path, not a working ffmpeg server. Production backend decision/deployment, isolated parser execution with resource limits, real phone playback and broad MOV codec/color testing remain open. No user assets uploaded, no production hosting or cost committed.
