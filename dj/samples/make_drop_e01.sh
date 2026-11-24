#!/bin/sh
# Pro DJ-drop chain for Kokoro af_bella take (raw2.wav)
set -e
ffmpeg -loglevel error -y -i raw2.wav -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,highpass=f=100,equalizer=f=4000:t=q:w=1.2:g=4,deesser=i=0.35,acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=4" -ar 44100 dry.wav
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 dry.wav)
ST=$(python3 -c "print(round($D-0.5,3))"); MS=$(python3 -c "print(int(($D-0.5)*1000))")
ffmpeg -loglevel error -y -i dry.wav -filter_complex "[0]asplit=2[a][b];[b]atrim=start=$ST,asetpts=PTS-STARTPTS,apad=pad_dur=1.2,aecho=0.8:0.9:220|440|660:0.45|0.3|0.18,adelay=$MS,volume=0.8[e];[a]apad=pad_dur=1.6[m];[m][e]amix=inputs=2:normalize=0:duration=longest,aecho=0.8:0.5:37|61|89|127|173:0.35|0.28|0.22|0.18|0.12,loudnorm=I=-12:TP=-1.5:LRA=7,alimiter=limit=0.89:level=false,silenceremove=stop_periods=-1:stop_threshold=-60dB:stop_duration=0.3" -ac 1 -ar 44100 -c:a libmp3lame -q:a 4 psycho-fingers-drop.mp3
