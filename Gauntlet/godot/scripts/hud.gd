class_name Hud
extends CanvasLayer
## Health/mana globes, skill bar with cooldown sweeps, kill counter, death message, control hints.

const SLOTS := ["primary", "secondary", "ultimate", "dodge"]
const KEYS := ["LMB", "Q / RMB", "E", "SPACE"]

var game
var hp_globe: ColorRect
var mp_globe: ColorRect
var slots: Array[ColorRect] = []
var kills: Label
var msg: Label
var sub: Label
var bar_rect := Rect2()
var _ready_prev := {}
var _flash := {}
var play_root: Control
var select_root: Control
var cards: Array[Control] = []
var hint: Label
var _feed: Array[Label] = []


func _ready() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	play_root = root
	root.visible = false
	var globe := load("res://shaders/globe.gdshader")
	hp_globe = _shader_rect(root, globe, 150)
	hp_globe.material.set_shader_parameter("liquid", Color(0.72, 0.06, 0.05))
	mp_globe = _shader_rect(root, globe, 150)
	mp_globe.material.set_shader_parameter("liquid", Color(0.13, 0.3, 0.9))
	_anchor(hp_globe, 0.5, 1.0, -330, -170)
	_anchor(mp_globe, 0.5, 1.0, 180, -170)
	var slot_sh := load("res://shaders/slot.gdshader")
	for i in 4:
		var s := _shader_rect(root, slot_sh, 64)
		s.material.set_shader_parameter("kind", i)
		_anchor(s, 0.5, 1.0, -146 + i * 74, -96)
		slots.append(s)
		var k := _label(root, KEYS[i], 12)
		k.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		k.size = Vector2(64, 16)
		_anchor(k, 0.5, 1.0, -146 + i * 74, -28)
	var plate := ColorRect.new()
	plate.color = Color(0.03, 0.025, 0.02, 0.55)
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.size = Vector2(320, 92)
	root.add_child(plate)
	root.move_child(plate, 0)
	_anchor(plate, 0.5, 1.0, -160, -104)
	kills = _label(root, "", 22)
	kills.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	kills.size = Vector2(800, 30)
	_anchor(kills, 0.5, 0.0, -400, 18)
	msg = _label(root, "", 54)
	msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	msg.size = Vector2(900, 70)
	msg.add_theme_color_override("font_color", Color(0.85, 0.15, 0.1))
	_anchor(msg, 0.5, 0.5, -450, -90)
	sub = _label(root, "", 20)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.size = Vector2(900, 30)
	_anchor(sub, 0.5, 0.5, -450, -10)
	hint = _label(root, "", 13)
	hint.modulate = Color(1, 1, 1, 0.55)
	hint.size = Vector2(900, 20)
	_anchor(hint, 0.0, 1.0, 16, -26)
	var tag := _label(root, "GAUNTLET", 13)
	tag.modulate = Color(1, 1, 1, 0.45)
	tag.size = Vector2(400, 20)
	_anchor(tag, 0.0, 0.0, 16, 12)
	bar_rect = Rect2()


func _shader_rect(root: Control, sh: Shader, px: int) -> ColorRect:
	var r := ColorRect.new()
	r.size = Vector2(px, px)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m := ShaderMaterial.new()
	m.shader = sh
	r.material = m
	root.add_child(r)
	return r


func _label(root: Control, text: String, size: int) -> Label:
	var l := Label.new()
	l.text = text
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", Color(0.92, 0.84, 0.68))
	l.add_theme_color_override("font_outline_color", Color(0.05, 0.03, 0.02))
	l.add_theme_constant_override("outline_size", maxi(4, size / 4))
	root.add_child(l)
	return l


func _anchor(c: Control, ax: float, ay: float, ox: float, oy: float) -> void:
	var s := c.size
	c.anchor_left = ax
	c.anchor_right = ax
	c.anchor_top = ay
	c.anchor_bottom = ay
	c.offset_left = ox
	c.offset_top = oy
	c.offset_right = ox + s.x
	c.offset_bottom = oy + s.y


func hovered(mouse: Vector2) -> bool:
	var vp := get_viewport().get_visible_rect().size
	return mouse.y > vp.y - 180 and absf(mouse.x - vp.x * 0.5) < 340


func show_message(title: String, subtitle: String, color := Color(0.85, 0.15, 0.1)) -> void:
	msg.add_theme_color_override("font_color", color)
	msg.text = title
	sub.text = subtitle


func _process(_dt: float) -> void:
	var p: Hero = game.player
	if p == null or p.preview:
		return
	hp_globe.material.set_shader_parameter("fill", p.hp / p.max_hp)
	mp_globe.material.set_shader_parameter("fill", p.mana / p.max_mana)
	for i in 4:
		var key: String = SLOTS[i]
		var kit: Dictionary = p.kit[key]
		var frac: float = p.cds[key] / kit.cd
		var m: ShaderMaterial = slots[i].material
		m.set_shader_parameter("cd", frac)
		m.set_shader_parameter("no_mana", 1.0 if p.mana < kit.mana else 0.0)
		var ready := frac <= 0.0
		var f: float = _flash.get(key, 0.0)
		if ready and not _ready_prev.get(key, true) and kit.cd > 1.0:
			f = 1.0
		_ready_prev[key] = ready
		_flash[key] = maxf(f - _dt * 3.0, 0.0)
		m.set_shader_parameter("ready_flash", _flash[key])
	var status := "Champions  %d     Slain  %d" % [game.heroes().size(), game.kills]
	if game.zone:
		var t: float = game.zone.time_left()
		status += "     Storm  " + ("closing" if t <= 0.0 else "%d:%02d" % [int(t) / 60, int(t) % 60])
	kills.text = status
	for l in _feed.duplicate():
		var age: float = l.get_meta("age") + _dt
		l.set_meta("age", age)
		l.modulate.a = clampf(6.0 - age, 0.0, 1.0)
		if age > 6.0:
			_feed.erase(l)
			l.queue_free()
	for i in _feed.size():
		_feed[i].position = Vector2(16, 44 + i * 24)


## Shows the in-game HUD for the chosen hero: resource globe colour and ability icons.
func bind_hero(h: Hero) -> void:
	mp_globe.material.set_shader_parameter("liquid", h.data.resource)
	for i in 4:
		slots[i].material.set_shader_parameter("kind", h.data.icons[i])
	var k: Dictionary = h.kit
	hint.text = "WASD move   ·   LMB %s   ·   Q / RMB %s   ·   E %s   ·   SPACE %s   ·   wheel zoom" % [k.primary.name, k.secondary.name, k.ultimate.name, k.dodge.name]
	play_root.visible = true
	if select_root:
		select_root.queue_free()
		select_root = null


## Class select overlay: title plus one card per class under the heroes standing at the shrine.
func show_select(order: Array) -> void:
	select_root = Control.new()
	select_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	select_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(select_root)
	var title := _label(select_root, "CHOOSE YOUR CHAMPION", 46)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.size = Vector2(1000, 60)
	title.add_theme_color_override("font_color", Color(0.93, 0.8, 0.55))
	_anchor(title, 0.5, 0.0, -500, 40)
	var sub_t := _label(select_root, "click a hero  ·  or press 1  2  3", 16)
	sub_t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub_t.size = Vector2(600, 24)
	sub_t.modulate = Color(1, 1, 1, 0.6)
	_anchor(sub_t, 0.5, 0.0, -300, 104)
	for i in order.size():
		var d: Dictionary = Hero.CLASSES[order[i]]
		var card := Panel.new()
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0.03, 0.025, 0.02, 0.72)
		sb.border_color = Color(0.55, 0.42, 0.24, 0.9)
		sb.set_border_width_all(2)
		sb.set_corner_radius_all(3)
		card.add_theme_stylebox_override("panel", sb)
		card.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.size = Vector2(300, 170)
		select_root.add_child(card)
		_anchor(card, 0.5, 1.0, -480 + i * 330, -200)
		var name_l := _label(card, "%d   %s" % [i + 1, d.name.to_upper()], 26)
		name_l.position = Vector2(18, 12)
		name_l.add_theme_color_override("font_color", Color(0.95, 0.82, 0.55))
		var role := _label(card, d.role, 15)
		role.position = Vector2(20, 50)
		role.modulate = Color(1, 1, 1, 0.7)
		var abil := []
		for k in ["primary", "secondary", "ultimate", "dodge"]:
			abil.append(d.kit[k].name)
		var ab := _label(card, "  ·  ".join(abil.slice(0, 2)) + "\n" + "  ·  ".join(abil.slice(2, 4)), 14)
		ab.position = Vector2(20, 84)
		var stats := _label(card, "Life %d   ·   Speed %.1f" % [d.hp, d.speed], 13)
		stats.position = Vector2(20, 134)
		stats.modulate = Color(1, 1, 1, 0.55)
		cards.append(card)


func highlight(i: int) -> void:
	for k in cards.size():
		var sb: StyleBoxFlat = cards[k].get_theme_stylebox("panel")
		sb.border_color = Color(1.0, 0.78, 0.4) if k == i else Color(0.55, 0.42, 0.24, 0.9)
		sb.set_border_width_all(3 if k == i else 2)
		cards[k].modulate = Color(1, 1, 1, 1) if k == i or i < 0 else Color(1, 1, 1, 0.7)


## Elimination / storm messages, top-left, newest last, fading after six seconds.
func feed(text: String, color: Color) -> void:
	var l := _label(play_root, text, 16)
	l.add_theme_color_override("font_color", color)
	l.set_meta("age", 0.0)
	l.size = Vector2(600, 22)
	_feed.append(l)
	if _feed.size() > 5:
		_feed.pop_front().queue_free()
