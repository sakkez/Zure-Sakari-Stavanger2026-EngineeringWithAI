// Rocks and standing stones: triplanar rock with moss collecting on upward faces.
shader_type spatial;

uniform sampler2D rock_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_r : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D moss_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform float moss = 1.0;

varying vec3 wp;
varying vec3 wn;
varying float ly;

void vertex() {
	ly = VERTEX.y;
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

vec3 tri(sampler2D t, vec3 p, vec3 w) {
	return texture(t, p.zy).rgb * w.x + texture(t, p.xz).rgb * w.y + texture(t, p.xy).rgb * w.z;
}

void fragment() {
	vec3 w = pow(abs(wn), vec3(4.0));
	w /= dot(w, vec3(1.0));
	vec3 p = wp * 0.55;
	vec3 rock = tri(rock_a, p, w);
	vec3 mo = tri(moss_a, p * 1.4, w);
	float m = smoothstep(0.62, 0.9, wn.y + (rock.g - 0.45) * 0.5) * moss;
	// darker toward the ground so stones sit in the grass
	ALBEDO = mix(mix(vec3(dot(rock, vec3(0.33))), rock, 0.45) * vec3(0.8, 0.8, 0.78), mo * 0.85, m) * mix(0.7, 1.0, clamp(ly + 0.5, 0.0, 1.0));
	ROUGHNESS = mix(tri(rock_r, p, w).r, 0.95, m);
	SPECULAR = 0.35;
}
