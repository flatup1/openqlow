# Volume 5 — Prompt Bible

Version: 1.1.0-design
Rule: Provider-neutral first

## 1. Prompt Philosophy

順序:

    人間
      → 感情
      → 物語
      → Hero Moment
      → 映像
      → Prompt

Promptから考え始めない。

### Runtime baseline guard

- Knowledgeがblocked、またはBrand Constitutionが利用不能ならPromptを作らない。
- rule-based baselineを先に使い、同じ入力から同じ論理出力を得る。
- 感情目標とHero Momentは各1つにする。
- Kids系は子どもの表層と親の深層を両方持つ。
- 直接style名は要素へ分解し、診断には除去数だけを残す。
- Negativeは素材とmodeに必要なカテゴリだけを選ぶ。
- CoreからProvider、LLM、外部送信、課金を呼ばない。

## 2. Master Prompt Structure

Final Promptは次のmoduleから作る。

1. Target
2. Objective
3. Emotional Goal
4. Human Context
5. Story
6. Hero Moment
7. Subject Preservation
8. Action
9. Body Mechanics
10. Camera
11. Lens and Composition
12. Lighting
13. Atmosphere and Color
14. Speed
15. Sound and Music
16. Continuity
17. Selected Negative Categories
18. Duration and Aspect Ratio
19. CTA / Editing Note

Provider commandは最後にAdapterが付ける。

## 3. Image-to-Video Master

Priority order:

1. identity
2. anatomy
3. temporal consistency
4. believable motion
5. environment
6. brand
7. cinematic enhancement

Master intent:

    Preserve the exact identity and physical attributes of every person in the reference.
    Preserve age, face, hairstyle, body proportions, clothing, gloves, logo placement,
    number of people, gym layout and background. Animate one clearly defined action.
    Use natural breathing, eye movement, balance, foot contact and realistic weight transfer.
    Keep lighting, camera continuity and environment stable across the shot.

Rules:

- 1 clip 1 primary action
- 5〜10 secondsを基本
- 顔が小さい場合は過剰な表情変化を要求しない
- 参照に写らない身体部位を大きく生成させない
- 途中で別場所へ移動しない
- 技は実在する単純な動作から始める

## 4. Target Modules

### Kids

- surface emotion: fun, curiosity
- pacing: readable, playful
- camera: eye level or slightly low
- action: one simple movement
- Hero Moment: smile, high-five, small success
- avoid: humiliation, fear, injury, overtraining

### Kids × Parents

- child layer: adventure, motion, imitation
- parent layer: safety, growth, respectful coaching
- visual proof: coach kneels, parent watches, child is welcomed
- Hero Moment: parent and child gloves, hand opens, shared smile

### Women Beginners

- barrier: intimidation, being watched, not keeping up
- emotional goal: safety or self-efficacy
- opening: calm face or first smile before combat
- action: first mitt hit, breath, stable stance
- Hero Moment: the moment tension turns into a smile
- avoid: body-shaming, weight-loss claims, sexualization

### Men Beginners

- barrier: embarrassment, comparison, past inactivity
- emotional goal: permission to start
- show: personal pace, clean technique, supportive coach
- avoid: macho challenge, weakness mocking

### Senior

- emotional goal: confidence and safe participation
- action: controlled range, balance, breathing
- camera: stable and readable
- avoid: medical claims, infantilization

### Family

- emotional goal: belonging
- show: shared activity without forcing equal ability
- Hero Moment: family members acknowledge each other

### Sparring / Competition

- emotional goal: admiration, challenge
- action readability first
- realistic preparation, weight transfer, guard, recovery
- dramatic but non-horrific
- Hero Moment: clean decisive motion or respectful glove touch
- avoid: blood, pain close-up, humiliation, dangerous gym image

### Facility

- emotional goal: safety
- show: clean floor, light, equipment, distance, welcoming entrance
- no people required
- avoid: empty darkness that feels unsafe

### Instructor

- customer remains protagonist
- instructor is guide
- show distance, eye level, cue, praise
- avoid hero worship

### Member Story

- real person consent required
- no invented hardship
- one verified transformation
- quote attribution only with approval

### Anime / Character

- original character only
- character sheet reference
- fixed silhouette, palette, clothing, proportions
- action and expression separated when possible
- no direct artist or studio references

## 5. Story Modules

### First Step

    hesitation → safe invitation → one action → small success → smile

### Belonging

    alone → notices group → welcomed → joins → shared rhythm

### Parent Trust

    observes → notices coaching behavior → child tries → coach responds kindly → relief

### Challenge

    focus → preparation → clean attempt → recovery → recognition

### Respectful Combat

    anticipation → readable exchange → decisive movement → control → respect

### Event

    what → why it matters → emotional reason → verified details from canon/event source → navigation

## 6. Hero Moment Rules

- one scene only
- visually understandable without explanation
- tied to Emotional Goal
- can become thumbnail
- does not require dialogue
- not a montage

## 7. Camera Dictionary

| Camera | Emotional use |
| --- | --- |
| slow dolly-in | empathy, decision, focus |
| dolly-out / pull-back | belonging, release, reveal |
| tracking | progress, participation |
| side tracking | technique readability |
| orbit | achievement, hero moment |
| controlled handheld | combat immediacy |
| gimbal follow | safe movement through space |
| low-angle | challenge and confidence, sparingly |
| over-the-shoulder | guidance, parent perspective |
| close-up | expression and emotion |
| extreme close-up | one detail, hand or eye; do not overuse |
| wide establishing | safety, environment, belonging |
| overhead | structure, group pattern |
| rack focus | shift attention between guide and customer |
| speed ramp | decisive movement only |
| brief slow motion | Hero Moment only |
| match cut | reuse, time progression |
| parallax | cinematic depth |
| foreground reveal | curiosity and entrance |

One short clip uses one main camera movement. Complex action may use controlled reactive movement, but readability is the test.

## 8. Lens and Composition

- wide: place, safety, group
- normal: honest human relation
- short telephoto: emotion without intrusion
- shallow depth: emotional focus
- deeper depth: action readability
- headroom and limb safety
- keep hands and feet inside frame for techniques
- no unnecessary dutch angle

## 9. Motion Dictionary

### Gentle

- natural breathing
- blink
- slight posture shift
- small smile
- soft glove lift
- one step
- high-five

### Training

- stance set
- jab
- straight punch
- controlled kick
- mitt impact
- recovery to guard

### Combat

- anticipation
- acceleration
- believable impact
- reaction
- controlled recovery
- respectful reset

Every technique includes:

- starting balance
- preparation
- weight transfer
- contact or near-contact
- recovery

## 10. Lighting

| Intent | Lighting |
| --- | --- |
| safety | soft natural or warm clean light |
| hope | gradual warm lift |
| focus | controlled contrast and rim light |
| child fun | bright, clean, colorful, not oversaturated |
| competition | cinematic contrast with readable faces |
| nostalgia | warm low-angle light, no gloomy manipulation |

Dark is not automatically cinematic. Faces, exits and floor must remain readable when safety is the emotional goal.

## 11. Color

- preserve real gym colors and logo
- warm neutrals for trust
- controlled accent colors for energy
- skin tone stability
- avoid random color shift between frames
- do not replace brand palette with Provider default style

## 12. Sound Dictionary

### Emotion

- soft emotional piano
- warm acoustic texture
- subtle ambient pad
- uplifting restrained rise
- playful childlike percussion
- restrained bass pulse

### Natural ambience

- breathing
- footsteps
- glove impact
- pad impact
- room ambience
- children laughing

### Combat

- anticipation silence
- clean impact
- restrained low pulse
- no horror hit
- no exaggerated bone or pain sound

Sound supports the emotion. It does not tell the viewer what to feel through excessive swelling.

## 13. Negative Dictionary

### Identity

- different face
- changed age
- changed hairstyle
- changed body proportions
- changed clothing or gloves
- subject swap
- identity drift

### Anatomy

- extra or missing fingers
- fused hands
- extra limbs
- broken joints
- duplicated people
- impossible pose

### Motion

- sliding feet
- floating
- teleporting
- impossible acceleration
- no weight transfer
- unnatural impact

### Temporal

- flicker
- morphing
- sudden face change
- clothing change
- frame-to-frame color instability

### Environment

- warped wall
- melted equipment
- moving logo
- changed gym layout
- sudden location change
- disappearing object

### Brand

- threatening expression
- horror
- blood
- humiliation
- aggressive intimidation
- unsafe child depiction
- dark inaccessible atmosphere
- body-shaming

## 14. Negative Composition Rules

- I2V person: all six categories
- original character animation: anatomy, motion, temporal, environment, brand; identity becomes character consistency
- facility: temporal, environment, brand
- still image: identity, anatomy, environment, brand
- combat: anatomy, motion, temporal, environment, brand

Providerがnegative fieldを持たない場合、AdapterはPrompt本文のavoid clauseへ安全に変換する。

## 15. Continuity

- same subject
- same wardrobe
- same equipment
- same light direction
- same location
- same number of people
- action begins from reference pose
- no off-screen subject creation

## 16. CTA / Editing Note

CTA is not part of generation image text unless explicitly needed for an end card. Text and QR are added in editing, not generated into live scene.

Profiles:

- none
- soft navigation
- explicit trial invitation with approval

Use verified URL / QR from canon or approved asset. Do not ask image model to invent readable logo or QR.

## 17. Output Format

Prompt Composer returns:

- Creative summary in Japanese
- Provider-neutral Prompt IR
- selected negative categories
- final natural-language prompt
- provider compatibility notes
- editing note
- assumptions
- Knowledge references
- VersionBundle
- estimated cost and approval requirement

## 18. Example A — Beginner Woman / I2V / Reel

Target: women beginners
Objective: trial
Emotional Goal: safety
Hero Moment: tension changes into a smile after the first clean mitt hit

Prompt:

    Preserve the exact identity, age, face, hairstyle, body proportions, clothing,
    gloves and gym background from the reference image. The beginner woman takes
    one calm breath, settles into a stable stance, throws one controlled straight
    punch into the focus mitt and naturally smiles after the clean contact.
    Show believable balance, foot contact, shoulder rotation and recovery to guard.
    Use a gentle side tracking camera with a subtle push-in at the smile.
    Clean warm gym lighting, natural skin tones, encouraging atmosphere,
    stable background and consistent identity throughout the shot.

Negative categories: identity, anatomy, motion, temporal, environment, brand.
Editing note: Add the soft trial navigation after the smile, outside the generated scene.

## 19. Example B — Kids Anime

Target: kids and parents
Objective: trust
Emotional Goal: fun
Child layer: one small adventure and high-five
Parent layer: coach teaches at eye level
Hero Moment: child and coach high-five after one successful movement

Prompt:

    Preserve the original character design, silhouette, proportions, hairstyle,
    clothing colors and bright clean gym layout. A young beginner character tries
    one simple guard movement. The coach kneels to the child's eye level, gives one
    gentle cue, and the child completes the movement. They share one joyful high-five.
    Playful readable motion, warm clean light, colorful accents, smooth stable camera,
    no sudden character or background change. The child remains the protagonist and
    the coach acts as a calm guide.

## 20. Example C — Competition

Target: martial arts fans and curious beginners
Objective: admiration
Emotional Goal: aspiration
Hero Moment: a clean kick followed by controlled recovery and respectful glove touch

Prompt:

    Preserve the exact athletes, equipment, uniforms and venue from the reference.
    Show a short readable exchange with clear silhouettes and realistic timing.
    One athlete prepares, transfers weight naturally and delivers one technically
    believable kick. Use dynamic side tracking with a brief controlled slow motion
    at the decisive moment, then return to real speed for a balanced recovery.
    Add reactive camera movement, restrained motion blur, dramatic rim light and
    subtle environmental particles while keeping faces and technique readable.
    End with control and mutual respect, creating excitement without fear or brutality.

Negative categories: identity, anatomy, motion, temporal, environment, brand.

## 21. Prompt Quality Checklist

- target first
- one objective
- one emotional goal
- customer protagonist
- one Hero Moment
- one primary motion per clip
- realistic body mechanics
- relevant camera only
- continuity
- selective negatives
- no direct style names
- no invented fact
- CTA context
- version trace
