---
name: zimage-realism
description: Create, refine, or review ZImage image prompts across providers, with believable lighting, natural skin and materials, and faithful composition. Apply photographic guidance to realistic images while preserving explicitly requested artistic styles.
---

# ZImage realism

Make an image feel like a specific scene that could exist. Every ZImage image model should receive the same quality standard, expressed in language its endpoint supports. Prompt instructions guide generation; they cannot guarantee a model will obey or replace inspecting the result.

## Preserve the brief

Keep the subject, action, identity, age, skin tone, body proportions, clothing, counts, text, and reference purpose intact. Add visual decisions only where the brief leaves room. Do not turn a drawing into a photograph, a night scene into daylight, or an ordinary person into a beauty campaign. Explicit style and editing requests take precedence over defaults.

## Light a scene that makes sense

For an unspecified photographic scene, prefer available light appropriate to the setting: a nearby window, open shade, or daylight softened by cloud. Describe where the light comes from and how it falls across the subject. At night, use plausible existing lamps or other scene lighting. Honor requested flash, studio, or dramatic lighting.

Keep shadow direction, softness, catchlights, reflections, and exposure consistent with those sources. Preserve detail in bright skin and readable shadow transitions. Avoid adding a glowing outline, mist, neon accents, or a sunset simply to make the picture impressive.

## Clear skin is still skin

Aim for a clean, healthy-looking complexion with subtle pores, fine facial hair, natural lip texture, restrained highlights, and gentle local color variation. Keep those details proportional to the crop and resolution: a distant face should not have macro-level pores.

Preserve age, distinguishing marks, undertones, and natural asymmetry. Avoid waxy smoothing, porcelain surfaces, uniform gloss, excessively white eyes or teeth, and sharpening that makes skin look gritty. Do not add acne, scars, freckles, wrinkles, sweat, or dirt as a shortcut to authenticity. Keep them when the reference or brief calls for them. Clear skin does not mean lighter skin or a younger face.

## Make the rest of the frame equally believable

- Anatomy: plausible joints, hands, gaze, expression, weight, and grip. Judge visible anatomy with its actual pose and occlusion; do not force every finger into view.
- Materials: cloth has weave and tension where visible; glass transmits and reflects its surroundings; metal and ceramics have distinct finishes. Avoid one glossy texture covering every surface.
- Space: objects touch or overlap convincingly, cast contact shadows, and share a coherent perspective. Reflections should agree with the scene.
- Camera: choose framing and focus for the subject. Keep blur gradual and related to scene depth. Do not combine incompatible camera cues or require everything sharp alongside extremely shallow focus.
- Finish: use controlled color and sharpening. Grain, motion blur, lens flare, and compression are optional aesthetic choices, never compulsory evidence of realism.

## Write the prompt

Start with the subject and action. Add setting, framing, motivated light, and only the texture details that matter. Prefer a short, coherent description over stacked claims such as masterpiece, ultra-real, 8K, award-winning, or perfect anatomy. Describe the visible result rather than issuing a long list of defects.

For instruction-following endpoints, state what must remain unchanged during an edit. For descriptive endpoints, use direct positive scene language. Use negative prompts only through a verified supported field; do not invent parameters, weights, camera metadata, or resolution guarantees. Preserve user-supplied native settings.

Example portrait direction:

> An eye-level photograph of the person described in the brief, seated beside a window. Soft daylight from the side falls gently across the face, with quiet shadows on the opposite cheek. The complexion is clear with subtle pores and fine facial texture visible at this distance. Preserve their skin tone and facial proportions. The eyes are in focus, clothing retains its weave, and the room softens gradually behind them.

Example object direction:

> A blue ceramic mug on a wooden kitchen table in cloudy morning light. The window reflects softly in the glaze, the handle joins the body cleanly, and a small contact shadow anchors the base. Keep the rim and nearby grain resolved, with the kitchen gently out of focus.

Use examples as patterns, not text to attach to every image. Never add a person or window to an unrelated brief.

## Review and refine

When an output is available, inspect the whole composition and then the focal subject. Check fidelity to the brief, lighting consistency, skin treatment, anatomy, contact shadows, material separation, and requested text. Fix the most visible failure with a targeted revision while preserving successful details. Do not automatically run paid retries; use the user's authorized generation scope. If no output was inspected, report prompt validation only.

## Runtime integration

The compact runtime rules live in `packages/shared/src/imageCreativeDirection.ts` and are applied by `prepareImagePrompt` before optional creative direction. Both current server image provider routes use that builder; previews use it too. Keep future image adapters on this common path. This skill file is agent guidance, not a file that image APIs load themselves.

Read [research notes](references/research.md) when revising the standard or checking provider-specific assumptions.
