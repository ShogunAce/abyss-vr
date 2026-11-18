# Cuts artifacts/video/raw.mp4 (from scripts/record-demo.mjs) into the submission demo (< 3 min):
# title card, captioned and speed-adjusted segments, a Hand signs card, and an end card.
import os, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

V = 'artifacts/video'
W, H = 1280, 906
FONT = 'C\\:/Windows/Fonts/segoeui.ttf'
BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
REG = 'C:/Windows/Fonts/segoeui.ttf'
EMOJI = 'C:/Windows/Fonts/seguiemj.ttf'
os.makedirs(f'{V}/parts', exist_ok=True)

def run(args):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], check=True)

def still(name, image, seconds):
    image.save(f'{V}/parts/{name}.png')
    run(['-loop', '1', '-t', str(seconds), '-i', f'{V}/parts/{name}.png', '-f', 'lavfi', '-t', str(seconds), '-i', 'anullsrc=r=48000:cl=stereo',
         '-vf', f'scale={W}:{H},fps=30,fade=t=in:d=0.5,fade=t=out:st={seconds - 0.5}:d=0.5', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-shortest', f'{V}/parts/{name}.mp4'])

def segment(name, start, end, speed, caption):
    with open(f'{V}/parts/{name}.txt', 'w', encoding='utf8') as f: f.write(caption)
    dur = (end - start) / speed
    vf = (f'crop=iw:ih-40:0:30,scale={W}:{H},setpts=(PTS-STARTPTS)/{speed},fps=30,'
          f"drawtext=fontfile='{FONT}':textfile='{V}/parts/{name}.txt':fontsize=30:fontcolor=white:line_spacing=8:"
          f'box=1:boxcolor=0x071824@0.72:boxborderw=18:x=(w-text_w)/2:y=h-text_h-46,'
          f'fade=t=in:d=0.4,fade=t=out:st={dur - 0.4:.2f}:d=0.4')
    run(['-ss', str(start), '-t', str(end - start), '-i', f'{V}/raw.mp4', '-f', 'lavfi', '-t', f'{dur:.2f}', '-i', 'anullsrc=r=48000:cl=stereo',
         '-vf', vf, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f'{V}/parts/{name}.mp4'])

def card(lines, bg=None):
    img = bg.copy() if bg else Image.new('RGB', (W, H), (7, 24, 36))
    if bg: img = img.filter(ImageFilter.GaussianBlur(14)); img = Image.blend(img, Image.new('RGB', (W, H), (4, 14, 22)), 0.62)
    d = ImageDraw.Draw(img)
    return img, d

def frame_at(t):
    run(['-ss', str(t), '-i', f'{V}/raw.mp4', '-frames:v', '1', '-vf', f'crop=iw:ih-40:0:30,scale={W}:{H}', f'{V}/parts/bg.png'])
    return Image.open(f'{V}/parts/bg.png').convert('RGB')

# Title
img, d = card([], frame_at(30))
d.text((W / 2, H / 2 - 60), 'ABYSS', font=ImageFont.truetype(BOLD, 120), fill=(233, 229, 218), anchor='mm')
d.text((W / 2, H / 2 + 40), 'The Living Ocean', font=ImageFont.truetype(REG, 44), fill=(119, 216, 219), anchor='mm')
d.text((W / 2, H / 2 + 110), 'A seated, hands-only mixed-reality dive for Meta Quest 3  ·  recorded in the IWER emulator', font=ImageFont.truetype(REG, 24), fill=(168, 199, 203), anchor='mm')
still('00-title', img, 4)

segment('01-room', 1.0, 13.4, 1.0, 'Your room, in mixed reality. Seated, hands only.\nTouch the glowing pearl to dive.')
segment('02-arrival', 13.4, 40, 1.3, 'Your room becomes a living reef.\nEverything is generated in code: no imported models or textures.')
segment('03-fish', 51.5, 64, 1.0, 'A calm hand draws the fish closer.\nA quick sweep startles the school.')

# Hand signs card
img, d = card([], frame_at(95))
d.text((W / 2, 120), 'One sign, one job', font=ImageFont.truetype(BOLD, 56), fill=(233, 229, 218), anchor='mm')
d.text((W / 2, 180), 'The Hand signs page in the Dive menu', font=ImageFont.truetype(REG, 26), fill=(119, 216, 219), anchor='mm')
signs = [('\U0001F90F', 'Pinch', 'Select a creature, button or the pearl'), ('\U0001F449', 'Point', 'Swim where your finger points'),
         ('\u270B', 'Open palm', 'Make light; hold to send a pulse'), ('\u270A', 'Fist', 'Show or hide the menu'),
         ('\U0001F44B', 'Quick sweep', 'Startle a fish school'), ('\u261D\uFE0F', 'Touch', 'Touch the pearl to dive')]
emoji = ImageFont.truetype(EMOJI, 54); name_f = ImageFont.truetype(BOLD, 36); does_f = ImageFont.truetype(REG, 32)
y = 260
for icon, name, does in signs:
    d.rounded_rectangle((200, y - 42, W - 200, y + 42), radius=18, fill=(14, 52, 70))
    d.text((270, y), icon, font=emoji, embedded_color=True, anchor='mm')
    d.text((330, y), name, font=name_f, fill=(233, 229, 218), anchor='lm')
    d.text((560, y), does, font=does_f, fill=(119, 216, 219), anchor='lm')
    y += 100
still('04-signs', img, 7)

segment('05-explore', 120, 178, 2.2, 'Point to swim. Find the glowing dive markers\nand learn the real ocean at each depth.')
segment('06-descent', 178.8, 209, 2.0, 'Descend through twilight to midnight.\nThe world moves, never you, so it stays comfortable.')
segment('07-spark', 209.6, 245, 1.5, 'In the dark, the water sparks wherever your hands move,\nlike real bioluminescent plankton.')
segment('08-reveal', 263, 327, 1.6, 'Hold an open palm: one pulse of light rolls out,\nand a giant squid emerges. Pinch to discover it.')

img, d = card([], frame_at(318))
d.text((W / 2, H / 2 - 50), 'ABYSS', font=ImageFont.truetype(BOLD, 96), fill=(233, 229, 218), anchor='mm')
d.text((W / 2, H / 2 + 30), 'Runs in Quest Browser', font=ImageFont.truetype(REG, 36), fill=(168, 199, 203), anchor='mm')
d.text((W / 2, H / 2 + 90), 'shogunace.github.io/abyss-vr', font=ImageFont.truetype(BOLD, 40), fill=(119, 216, 219), anchor='mm')
still('09-end', img, 5)

parts = sorted(p for p in os.listdir(f'{V}/parts') if p.endswith('.mp4'))
with open(f'{V}/parts/list.txt', 'w') as f:
    for p in parts: f.write(f"file '{p}'\n")
run(['-f', 'concat', '-safe', '0', '-i', f'{V}/parts/list.txt', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
     '-movflags', '+faststart', f'{V}/ABYSS-demo.mp4'])
print('ok')
