// Grass clumps (MultiMesh): root-to-tip gradient, per-instance tint, wind sway, terrain-like normals.
shader_type spatial;
render_mode cull_disabled, diffuse_lambert_wrap;

uniform vec3 base_col : source_color = vec3(0.06, 0.08, 0.035);
uniform vec3 tip_col : source_color = vec3(0.36, 0.38, 0.17);

varying float hf;

void vertex() {
	hf = UV.y;
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float wind = sin(TIME * 1.7 + w.x * 0.35 + w.z * 0.22) + 0.5 * sin(TIME * 3.3 + w.x * 0.9 - w.z * 0.4);
	VERTEX.x += wind * 0.07 * hf * hf;
	VERTEX.z += wind * 0.035 * hf * hf;
	NORMAL = normalize(mix(NORMAL, vec3(0.0, 1.0, 0.0), 0.8));
}

void fragment() {
	vec3 c = mix(base_col, tip_col, hf) * COLOR.rgb;
	ALBEDO = c;
	ROUGHNESS = 0.9;
	SPECULAR = 0.15;
	AO = mix(0.35, 1.0, hf);
	BACKLIGHT = c * 0.6;
}
