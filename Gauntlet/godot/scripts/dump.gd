# Dev tool: prints mesh names and animation names of character GLBs.
# godot --headless --path godot --script res://scripts/dump.gd
extends SceneTree

func _init() -> void:
	for f in ["Knight", "Rogue_Hooded"]:
		var inst: Node = load("res://assets/characters/%s.glb" % f).instantiate()
		var names := []
		for m in inst.find_children("*", "MeshInstance3D", true, false):
			names.append(m.name)
		print(f, ": ", ", ".join(names))
		var ap: AnimationPlayer = inst.find_child("AnimationPlayer", true, false)
		var keep := []
		for a in ap.get_animation_list():
			if a.begins_with("2H") or a.begins_with("Dodge") or a.begins_with("1H_Ranged"):
				keep.append("%s(%.2f)" % [a, ap.get_animation(a).length])
		print("  ", ", ".join(keep))
		inst.free()
	quit()
