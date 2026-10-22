// Weapon trail arc: UV.x runs along the swing, UV.y from inner to outer radius. The bright edge
// sweeps with `progress` and leaves a fading wake; brightest at the blade tip (outer edge).
shader_type spatial;
render_mode blend_add, unshaded, depth_draw_never, cull_disabled, shadows_disabled;

uniform float progress = 1.0;
uniform float fade = 1.0;
uniform vec4 color : source_color = vec4(1.0, 0.85, 0.6, 1.0);
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;

void fragment() {
	float head = progress;
	float wake = smoothstep(head - 0.65, head, UV.x) * step(UV.x, head);
	float edge = pow(UV.y, 6.0) * (1.0 - smoothstep(0.94, 1.0, UV.y)) + smoothstep(0.75, 0.97, UV.y) * 0.6 * (1.0 - smoothstep(0.97, 1.0, UV.y));
	float n = texture(noise_tex, vec2(UV.x * 2.0 - TIME * 0.5, UV.y * 0.6)).r;
	float a = wake * edge * mix(0.35, 1.2, n) * fade * mix(0.4, 1.0, smoothstep(head - 0.25, head, UV.x));
	ALBEDO = color.rgb * 2.2;
	ALPHA = clamp(a * color.a, 0.0, 1.0);
}
