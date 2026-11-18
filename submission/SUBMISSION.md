# ABYSS — Devpost submission copy

Live build: https://shogunace.github.io/abyss-vr/ (open in Quest Browser → Enter XR → set controllers down)

---

## About the project

## Inspiration

More than 80% of the ocean has never been mapped or explored, and most people will never scuba dive, let alone see the deep sea. We wanted to give anyone with a Quest the feeling of sinking slowly from bright reef water into total darkness, and of finding out that the dark is alive.

We also wanted it to be *gentle*. A lot of VR asks you to stand, walk, aim and shoot. ABYSS is the opposite: you sit down, put your controllers away, and use your bare hands the way you would in real water — reaching out, holding still, opening your palm. The ocean reacts to *you*, not to a menu.

## What it does

ABYSS turns your room into a living ocean, then takes you down through it in a seated, hands-only journey of about 5–8 minutes:

1. **Your room.** In mixed reality (passthrough), a glowing sphere floats in front of you while bubbles rise and a few scout fish circle it. NAMI, a small guide light, invites you in.
2. **Arrival.** Pinch the sphere, touch it with a fingertip, or hold up an open palm. Your room slowly dissolves into a sunlit reef over about eight seconds.
3. **A living reef.** Sculpted sand dunes under dancing caustic light, encrusted rocks, branching and brain corals, sea fans, tube sponges, anemones, sea whips, urchins, starfish, seagrass and a ring of tall golden kelp, all swaying together in the tidal surge. A school of 120 chromis swims, banks and turns as one, while a second school of anthias, tangs and basslets lives over the reef. Even the floating particles swirl in the wake of your hands.
4. **Your hands matter.** Hold a calm hand out and the fish drift toward it. Sweep your hand quickly and they scatter, then regroup.
5. **Encounters.** A green sea turtle glides past. Point at it and pinch to "discover" it: a card shares facts about the species.
6. **Open blue.** A grey reef shark arrives, notices you, investigates from a respectful distance and turns away, while the school flees on its own.
7. **Midnight.** Sunlight fades out. Moon jellies drift and an anglerfish dangles its lure. Open your palm and the plankton around your hand begins to glow.
8. **The reveal.** Pinch and release to send out one pulse of bioluminescent light. When it reaches the deep dark, a giant squid emerges as a glowing silhouette.

The **Depth Compass**, a small panel by your left hand, lets you jump between Sunlit, Open blue, Twilight and Midnight, pause, switch to reduced motion ("Calm"), toggle sound and the guide, recenter, or restart. Discoveries and comfort settings are saved on the device. The camera is never moved: depth and travel move the *world*, never the player, so it stays comfortable for people prone to motion sickness.

## How we built it

- **IWSDK 1.1.0** (Meta's Immersive Web SDK) on **WebXR**, rendered with **Three.js**, written in **TypeScript** and bundled with **Vite**. It runs straight from a URL in Quest Browser with no install.
- **Entity-component-system architecture.** Separate systems for gestures, the opening sphere, the ocean and depth, creatures, the bioluminescent reveal, and the guide, sharing one small runtime service.
- **Pure, tested simulation core.** Boids flocking with a spatial hash, a shark behaviour state machine, an encounter scheduler, a bioluminescence wavefront, a pinch arbiter and the guide's caption logic live in plain TypeScript modules with no rendering code. They're covered by 27 unit tests run directly by Node.
- **100% procedural content.** No downloaded models, textures or audio files. Every creature is built from lathe and extruded geometry. Every surface is a custom GLSL shader that shares depth, light, fog and caustic uniforms, so the whole ocean darkens and shifts colour together as you descend. The terrain is a heightfield, the reef is placed from a seeded generator, and the soundscape is synthesized live with the Web Audio API.
- **Performance by design.** Every repeated thing (fish, corals, seagrass, light shafts, plankton) is a single instanced draw call, populations scale with depth, and per-frame allocation is treated as a bug.
- **Hand tracking that feels steady.** Palm and fingertip positions run through One Euro filters (steady when your hand rests, low lag when it moves), and the travel direction is smoothed so hand tremor never makes the glide wobble.
- **Testing without a headset.** We drove the whole experience end-to-end in **IWER** (the Immersive Web Emulator) with scripted hand poses, pinches and sweeps: 34 automated experience checks, plus ocean, journey and smoke suites. Then we tuned on a Quest 3.
- **Shipping.** GitHub Actions typechecks, tests, builds and deploys to GitHub Pages on every push, so a fresh build is on the headset within minutes.

## Challenges we ran into

- **Making hands feel reliable.** Telling a relaxed hand from an open palm, and a deliberate sweep from a tracking glitch, took measured thresholds: finger extension, thumb gap and finger spread for the palm, and a distance-based jump guard for teleporting joints. The first version counted every tracking hiccup as a sweep.
- **One pinch, one meaning.** A pinch could mean "inspect this creature", "send a light pulse" or "glide that way". We built a priority arbiter (target > pulse > travel) so each pinch does exactly one thing.
- **Invisible things stealing your pointer.** Jellyfish tentacles, decorative glow sprites and the curious fish school were all silently intercepting hand rays meant for the UI. One sprite even froze the render loop at twilight. Each one needed its own fix.
- **Fish that looked wrong.** Early fish swam nose-up and rolled randomly because orientation came straight from velocity. We added climb limits, smoothed headings and banking turns built on an upright basis.
- **Headset feedback.** The first Quest session showed the opening sphere was hard to hit, the fish crowded your hand, and the guide sat in the middle of the view. We added a larger pick volume, hover feedback and fingertip touch; gave the fish keep-out zones; and made the guide toggleable and moved it aside.

## Accomplishments that we're proud of

- A complete emotional arc — room, reef, open water, midnight, reveal — that works with **bare hands only** and **no locomotion**.
- An entire ecosystem with **zero imported assets**: every fish, coral, rock, shader and sound is generated in code.
- A shark encounter that feels tense but never threatening: it respects a 3.2 m comfort radius every time, and that's verified by tests.
- The midnight reveal: one pulse of light rolling outward through the dark until a giant squid lights up.
- A real engineering backbone for a jam project: unit tests, scripted end-to-end emulator tests, and continuous deployment.

## What we learned

- Hand interaction design lives in the thresholds. The difference between "magical" and "broken" was often 2 cm of finger spread or 0.1 m/s of hand speed.
- Restraint is a comfort feature. Moving the world instead of the player, slowing depth changes and adding a Calm mode made the experience accessible to more people.
- Emulators like IWER make VR testable, but only a headset tells you whether something *feels* right. The two together were far faster than either alone.
- Shared shader uniforms are a cheap way to make a huge procedural scene feel cohesive: one "depth" value re-lights everything.

## What's next for AbyssVR

- **Room-aware ocean:** use Quest scene understanding (planes and meshes) so coral grows from your real floor and fish weave around your real furniture.
- More species and biomes: hydrothermal vents, seagrass meadows with rays, whale encounters.
- Voice questions to NAMI ("what is that?") for a fully hands-free guide.
- Shared dives: two people in the same ocean, pointing things out to each other.
- An installable Horizon Store build (PWA), and a classroom mode with ocean-science lessons.

---

## Built with

```
iwsdk
webxr
three.js
typescript
javascript
glsl
vite
web-audio-api
iwer
meta-quest-3
hand-tracking
passthrough
mixed-reality
node.js
github-actions
github-pages
```

---

## What Meta VR capability(ies) did you use in your project?

- **Hand tracking (WebXR Hand Input).** The entire experience is controller-free. We read all 25 hand joints per hand every frame for pinch, open palm, pointing, fingertip touch and sweep detection.
- **Passthrough / mixed reality (`immersive-ar` session).** The experience begins in your real room and the ocean dissolves in around you, then fades back to your room on exit.
- **Meta's Immersive Web SDK (IWSDK)**, including its ECS, hand-ray pointer interaction (`RayInteractable`, hover and pressed states), spatial UI and input system.
- **Meta Quest Browser / WebXR on Quest 3 and 3S**: no install, it runs from a URL.
- **IWER (Immersive Web Emulator)** with the Meta Quest 3 device profile, for automated end-to-end testing of hand interactions.

## Describe how Hand Interactions are implemented into your experience.

Hands are the only input; there is no controller requirement and no on-screen button you have to press with a controller. Each frame, a gesture system reads the WebXR joint poses for both hands and computes palm position and direction, which fingers are extended, the thumb-to-index pinch distance, finger spread and hand speed. A pure, unit-tested gesture module turns those features into intent:

- **Point + pinch to select.** IWSDK's hand rays let you point at creatures, the opening sphere, the Depth Compass buttons, NAMI's caption and discovery cards. Targets highlight on hover and activate on pinch. Small targets get enlarged invisible pick volumes so they're easy to hit.
- **Fingertip touch.** You can poke the opening sphere directly with your index fingertip. It fires once and re-arms only after you pull your hand back, and fast passes through it are ignored.
- **Open palm.** Holding up an open hand (four fingers extended, thumb out, fingers spread) for about half a second lets the ocean into your room. At midnight, an open palm makes nearby plankton glow and "arms" your light pulse.
- **Pinch-release pulse.** After an open palm at depth, pinch and release to emit exactly one bioluminescent wave, which reveals the giant squid.
- **Pinch-and-hold travel.** Pinch and hold while pointing at open water to glide gently in that direction (the world moves, not you). Release to stop.
- **Calm hand vs. fast sweep.** A steady, slow hand attracts the fish school, which gathers at a comfortable distance from your fingers. A quick sweep scatters them, and they regroup a few seconds later.
- **Arbitration and robustness.** A priority arbiter makes every pinch mean one thing (inspect a target > light pulse > travel). Short hold and release timers stop gestures flickering. A distance-based jump guard ignores tracking glitches, and the experience keeps running and recovers cleanly when hands leave the tracking volume.

## What makes you excited about the future of VR?

What excites us most is that VR is becoming something you just *open*. Hand tracking means there's nothing to learn and nothing to hold. Mixed reality means you don't have to leave your room, or the people in it, behind. And WebXR means a whole experience is one link away, with no install and no store. Put those together and VR stops being a gaming peripheral and becomes a place you can take anyone: a grandparent who will never scuba dive, a kid who has never seen the ocean, a classroom. We think the next wave of VR is about wonder, calm and learning as much as action, and that it will be built by small teams shipping straight to the web.
