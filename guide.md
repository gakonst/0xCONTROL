We are implementing Rekordbox-style waveform analysis for our app. It has to look high fidelity and be fast.

We will first implement Step 1 below, and only move to Step 2 and after when I say that Step 1 is done.

# Step 1

Firstly, we want a RGB waveform which handles bass = red, melody = blue, voice = green, very high frequencies = white. We will want to mimic the Pioneer Rekordbox style as closely as possible. This was deeply analyzed here: https://djl-analysis.deepsymmetry.org/

While playing, we want a white vertical line that highlights where we are in the track which becomes red when the track is paused. We will want to be able to click around the waveform to seek around the track.

We will iterate on it locally first, by generating a preview page which shows the waveform against a track. Then once we are happy with our preview (I'll tell you when I'm happy with it) we will integrate it into our app. It's OK to use ffmpeg for audio decoding.

# Step 2

Then we will want to do BPM analysis. After that, we will add a beat grid with a thin white low opacity vertical line on every beat, and white arrows pointing inwards to the line so it's like below:
v v v v v
| | | | |
^ ^ ^ ^ ^

On the "1" of every bar, the line should be higher opacity, and the arrows should be red.

Ideally you can also show help me do phrase detection and automatically set cue points 16 bars before a pphrase starts. And then we maybe will add a new button to the full screen player to jump across cue points.

# Step 3

Once we are done with that, we will want to do Key Detection. I am not sure how to approach that, but I know that Mixed In Key has the best algorithm, so maybe you can do something from them.

# Step 4

Finally, we integrate the analysis into our app so that it wokrs with cloudflare workers / hosted.

The integration will look like:
- We want every song in the library to be analyzed. This means every song in the Cloudflare R2 bucket.
- We will want to persist the analyzed metadata to the D1 database, for every song.
- Anytime a new song is detected, it's analyzed via a Cloudflare Worker route that implements the algorithm we tested locally before. This should ideally re-use the same code, so that we can debug things locally / iterate and get the cloudflare integration 'for free'.
- Instead of showing the track thumbnail we will be showing the analyzed waveform compactly, so that I cna at a glance see energy levels of various tracks.
- When in the full screen player view, I should be able to scroll around a track using the standard progress bar, but also by tapping on the waveform.
