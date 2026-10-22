// Lake: depth-tinted refraction, scrolling normals, sky reflections via the PBR path, shore foam.
shader_type spatial;
render_mode blend_mix, depth_draw_always, cull_back, specular_schlick_ggx;

uniform sampler2D depth_tex : hint_depth_texture, filter_linear_mipmap;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform sampler2D wave_a : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D wave_b : hint_normal, repeat_enable, filter_linear_mipmap;
uniform sampler2D foam_noise : repeat_enable, filter_linear_mipmap;
uniform vec3 shallow : source_color = vec3(0.22, 0.27, 0.22);
uniform vec3 deep : source_color = vec3(0.06, 0.11, 0.12);

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 uv = wpos.xz;
	vec3 na = texture(wave_a, uv * 0.06 + TIME * vec2(0.012, 0.008)).rgb;
	vec3 nb = texture(wave_b, uv * 0.11 - TIME * vec2(0.01, 0.014)).rgb;
	vec3 n = normalize(mix(na, nb, 0.5) * 2.0 - 1.0);
	NORMAL_MAP = n * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 0.5;

	float d = texture(depth_tex, SCREEN_UV).r;
	vec4 v = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, d, 1.0);
	v.xyz /= v.w;
	float thick = max(VERTEX.z - v.z, 0.0);
	float t = 1.0 - exp(-thick * 0.55);

	vec2 ruv = SCREEN_UV + n.xy * 0.025 * clamp(thick, 0.0, 1.0);
	vec3 refr = textureLod(screen_tex, ruv, 1.5 * t).rgb;
	vec3 body = mix(refr * shallow * 2.6, deep, t);

	float fn = texture(foam_noise, uv * 0.35 + TIME * 0.02).r;
	float edge = 1.0 - smoothstep(0.0, 0.18, thick);
	float foam = edge * smoothstep(0.5, 0.75, fn + edge * 0.25) * 0.7;

	// Body colour comes through EMISSION (unlit); the lit part is a dark glossy surface whose
	// reflections (reflection probe + sky) carry the hills and trees.
	ALBEDO = mix(vec3(0.01, 0.02, 0.022), vec3(0.5, 0.52, 0.48), foam);
	EMISSION = body * (1.0 - foam) * 1.1;
	ROUGHNESS = mix(0.03, 0.8, foam);
	METALLIC = mix(0.75, 0.0, foam);
	SPECULAR = 0.5;
	ALPHA = 1.0;
}
