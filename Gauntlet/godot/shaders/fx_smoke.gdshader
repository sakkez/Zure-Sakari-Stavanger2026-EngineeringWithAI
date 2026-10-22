// Alpha-blended smoke/dust billboard: billowy noise, fake top lighting, soft depth fade
// (mid-tone, never a flat black disc).
shader_type spatial;
render_mode blend_mix, unshaded, depth_draw_never, cull_disabled, shadows_disabled;

uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
uniform sampler2D depth_tex : hint_depth_texture, filter_linear_mipmap;

varying float age;
varying float seed;

void vertex() {
	age = INSTANCE_CUSTOM.y;
	seed = float(INSTANCE_ID) * 0.6180339;
	mat4 w = mat4(normalize(INV_VIEW_MATRIX[0]), normalize(INV_VIEW_MATRIX[1]), normalize(INV_VIEW_MATRIX[2]), MODEL_MATRIX[3]);
	float a = INSTANCE_CUSTOM.x;
	w = w * mat4(vec4(cos(a), -sin(a), 0.0, 0.0), vec4(sin(a), cos(a), 0.0, 0.0), vec4(0.0, 0.0, 1.0, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_MATRIX = VIEW_MATRIX * w;
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	vec2 o = vec2(fract(seed), fract(seed * 3.7));
	float n = texture(noise_tex, UV * 0.5 + o + age * 0.15).r * 0.65 + texture(noise_tex, UV * 1.1 - o).r * 0.35;
	float a = smoothstep(0.0, 0.55, (1.0 - r) * 0.9 + (n - 0.5) * 0.9);
	float lit = mix(0.55, 1.15, clamp(0.5 - p.y * 0.5 + (n - 0.5) * 0.6, 0.0, 1.0));
	float d = texture(depth_tex, SCREEN_UV).r;
	vec4 v = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, d, 1.0);
	v.xyz /= v.w;
	a *= clamp((VERTEX.z - v.z) / 1.2, 0.0, 1.0);
	ALBEDO = COLOR.rgb * lit;
	ALPHA = clamp(a * COLOR.a, 0.0, 1.0);
}
