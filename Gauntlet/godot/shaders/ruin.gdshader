// Ruin masonry: triplanar weathered brick, damp grime creeping up from the ground (COLOR.r = height
// above ground, 0..1 over ~1.8 m), rain streaks, and moss on upward faces.
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D brick_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D brick_r : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D moss_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;

varying vec3 wp;
varying vec3 wn;

void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

vec3 tri(sampler2D t, vec3 p, vec3 w) {
	return texture(t, p.zy).rgb * w.x + texture(t, p.xz).rgb * w.y + texture(t, p.xy).rgb * w.z;
}

void fragment() {
	vec3 w = pow(abs(wn), vec3(6.0));
	w /= dot(w, vec3(1.0));
	vec3 p = wp * 0.38;
	vec3 b = tri(brick_a, p, w);
	b = mix(vec3(dot(b, vec3(0.33))), b, 0.12) * vec3(0.8, 0.8, 0.82);
	float n = texture(noise_tex, wp.xz * 0.15 + wp.y * 0.05).r;
	float streak = texture(noise_tex, vec2((wp.x + wp.z) * 0.7, wp.y * 0.04)).r;
	float grime = 1.0 - COLOR.r;
	vec3 col = b * mix(1.0, 0.5, smoothstep(0.25, 1.0, grime + (n - 0.5) * 0.5));
	col = mix(col, col * vec3(0.78, 0.85, 0.62), grime * 0.55);
	col *= mix(0.8, 1.08, streak);
	float m = smoothstep(0.6, 0.92, wn.y + (n - 0.5) * 0.7);
	col = mix(col, tri(moss_a, p * 1.3, w) * 0.75, m);
	ALBEDO = col;
	ROUGHNESS = mix(tri(brick_r, p, w).r, 0.95, m);
	SPECULAR = 0.3;
}
