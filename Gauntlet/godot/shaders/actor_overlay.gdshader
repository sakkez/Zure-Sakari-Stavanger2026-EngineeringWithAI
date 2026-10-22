// Additive overlay on every character mesh: fresnel rim, hit flash and frozen tint (per instance).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, shadows_disabled;

instance uniform float flash = 0.0;
instance uniform float frost = 0.0;
instance uniform vec3 rim_color = vec3(0.45, 0.6, 0.9);
instance uniform float rim = 0.3;

void fragment() {
	float f = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	vec3 c = rim_color * f * rim;
	c += vec3(1.0, 0.85, 0.7) * flash * flash * 0.28;
	c += vec3(0.3, 0.6, 1.0) * frost * (0.22 + f * 0.8);
	ALBEDO = c;
}
