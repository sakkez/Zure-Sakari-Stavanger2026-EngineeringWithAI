// Terrain splat: grass base, forest floor / mud / rock blended by baked vertex weights
// (COLOR.r ground, COLOR.g mud, COLOR.b rock) with height-blended transitions and anti-tiling.
shader_type spatial;
render_mode cull_disabled;

uniform sampler2D grass_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D grass_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D grass_r : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D ground_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D ground_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D ground_r : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D mud_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D mud_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D mud_r : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_r : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D flag_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D flag_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D flag_r : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform float water_y = -0.6;
uniform vec4 zone = vec4(0.0, 0.0, 999.0, 0.0);       // centre xz, radius, enabled
uniform vec3 zone_next = vec3(0.0, 0.0, 999.0);       // next centre xz, radius

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

// Two scales, rotated against each other, so 1k textures don't visibly tile at game distance.
vec4 sample2(sampler2D t, vec2 uv) {
	vec2 uv2 = mat2(vec2(0.8, -0.6), vec2(0.6, 0.8)) * uv * 0.31 + 0.17;
	return mix(texture(t, uv), texture(t, uv2), 0.4);
}

float hblend(float w, float h) {
	return smoothstep(0.0, 0.25, w * 1.25 + (h - 0.5) * 0.6 - 0.15);
}

void fragment() {
	vec2 uv = wpos.xz * 0.22;
	float n_big = texture(noise_tex, wpos.xz * 0.008).r;
	float n_mid = texture(noise_tex, wpos.xz * 0.045 + 0.37).r;

	vec3 a = sample2(grass_a, uv).rgb;
	vec3 nm = sample2(grass_n, uv).rgb;
	float r = sample2(grass_r, uv).r;
	// grass tint: olive in the open, cooler/darker in noise hollows
	a *= mix(vec3(0.78, 0.82, 0.7), vec3(1.05, 1.0, 0.86), n_big);

	vec3 ga = sample2(ground_a, uv * 0.9).rgb;
	float wg = hblend(clamp(COLOR.r + (n_mid - 0.5) * 0.3, 0.0, 1.0), dot(ga, vec3(0.33)) * 2.0);
	a = mix(a, ga, wg);
	nm = mix(nm, sample2(ground_n, uv * 0.9).rgb, wg);
	r = mix(r, sample2(ground_r, uv * 0.9).r, wg);

	vec3 ma = sample2(mud_a, uv * 0.8).rgb;
	float wm = hblend(COLOR.g, dot(ma, vec3(0.33)) * 2.0);
	// wet darkening right at the shore
	float wet = 1.0 - smoothstep(water_y, water_y + 0.5, wpos.y);
	a = mix(a, ma * mix(1.0, 0.55, wet), wm);
	nm = mix(nm, sample2(mud_n, uv * 0.8).rgb, wm);
	r = mix(r, mix(sample2(mud_r, uv * 0.8).r, 0.35, wet), wm);

	vec2 ruv = (wpos.xz + vec2(wpos.y * 0.7, wpos.y * 0.4)) * 0.12;
	vec3 ra = sample2(rock_a, ruv).rgb;
	float wr = hblend(COLOR.b, dot(ra, vec3(0.33)) * 2.2);
	a = mix(a, ra * 0.85, wr);
	nm = mix(nm, sample2(rock_n, ruv).rgb, wr);
	r = mix(r, sample2(rock_r, ruv).r, wr);

	// broken flagstones around the shrine: grass and dirt show through the gaps
	vec2 fuv = wpos.xz * 0.16;
	vec3 fa = texture(flag_a, fuv).rgb;
	float wf = hblend(clamp(COLOR.a + (n_mid - 0.5) * 0.5, 0.0, 1.0), dot(fa, vec3(0.33)) * 2.4);
	a = mix(a, fa * vec3(0.72, 0.7, 0.66), wf);
	nm = mix(nm, texture(flag_n, fuv).rgb, wf);
	r = mix(r, texture(flag_r, fuv).r, wf);

	ALBEDO = a * vec3(0.8, 0.84, 0.76);

	// storm: ground outside the zone is drained and tinted, the wall base glows, and the next
	// circle is drawn as a slowly marching dashed line
	if (zone.w > 0.5) {
		float dz = length(wpos.xz - zone.xy);
		float outside = smoothstep(zone.z - 0.5, zone.z + 1.5, dz);
		ALBEDO = mix(ALBEDO, vec3(dot(ALBEDO, vec3(0.33))) * vec3(0.55, 0.45, 0.8), outside * 0.8);
		EMISSION = vec3(0.45, 0.2, 1.0) * (1.0 - smoothstep(0.0, 2.5, abs(dz - zone.z))) * 0.35;
		float dn = length(wpos.xz - zone_next.xy);
		float ang = atan(wpos.z - zone_next.y, wpos.x - zone_next.x);
		float dash = step(0.5, fract(ang * zone_next.z / 2.2 + TIME * 0.4));
		float line = 1.0 - smoothstep(0.06, 0.16, abs(dn - zone_next.z));
		EMISSION += vec3(0.9, 0.85, 1.0) * line * dash * 0.45 * step(zone_next.z, zone.z - 0.5);
	}
	NORMAL_MAP = nm;
	NORMAL_MAP_DEPTH = 1.2;
	ROUGHNESS = clamp(r * 1.05, 0.08, 1.0);
	SPECULAR = 0.35;
}
