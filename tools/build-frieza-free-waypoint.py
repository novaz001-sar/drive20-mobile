import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def get_arg(flag, fallback=None):
    if flag not in sys.argv:
        return fallback
    index = sys.argv.index(flag)
    return sys.argv[index + 1] if index + 1 < len(sys.argv) else fallback


SOURCE_PATH = Path(get_arg("--source", r"C:\Users\zstom\Downloads\frieza figure 3d model.glb"))
OUTPUT_PATH = Path(get_arg("--output", r"E:\Codex\projects\drive20-mobile\src\assets\models\optimized\free-waypoint-frieza-salute.glb"))
DECIMATE_RATIO = float(get_arg("--ratio", "0.045"))
TARGET_HEIGHT = float(get_arg("--height", "3.4"))


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_source():
    if not SOURCE_PATH.exists():
        raise FileNotFoundError(f"Source Frieza GLB not found: {SOURCE_PATH}")
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_PATH))


def remove_placeholders():
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and len(obj.data.vertices) <= 32:
            bpy.data.objects.remove(obj, do_unlink=True)


def get_meshes():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def scene_bounds(objects):
    mins = Vector((float("inf"), float("inf"), float("inf")))
    maxs = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, point.x)
            mins.y = min(mins.y, point.y)
            mins.z = min(mins.z, point.z)
            maxs.x = max(maxs.x, point.x)
            maxs.y = max(maxs.y, point.y)
            maxs.z = max(maxs.z, point.z)
    return mins, maxs


def normalize_model(meshes):
    mins, maxs = scene_bounds(meshes)
    size = maxs - mins
    scale = TARGET_HEIGHT / max(size.z, 0.001)
    center_x = (mins.x + maxs.x) * 0.5
    center_y = (mins.y + maxs.y) * 0.5

    root = bpy.data.objects.new("frieza_salute_root", None)
    bpy.context.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.4

    for obj in meshes:
        obj.location.x -= center_x
        obj.location.y -= center_y
        obj.location.z -= mins.z
        obj.scale *= scale
        obj.parent = root
        obj.name = "frieza_original_figure"
        try:
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.shade_smooth()
            obj.select_set(False)
        except Exception:
            obj.select_set(False)

    # The Tripo source faces Blender +X. Rotate the asset so its face points
    # toward the game's default third-person approach direction after loading.
    root.rotation_euler = (0, 0, math.radians(-90))
    return root


def simplify_meshes(meshes):
    for obj in meshes:
        if len(obj.data.polygons) < 5000:
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new("mobile_decimate", "DECIMATE")
        modifier.ratio = DECIMATE_RATIO
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)


def create_salute_loop(root):
    root.animation_data_create()
    action = bpy.data.actions.new("KneelSaluteLoop")
    root.animation_data.action = action
    root.rotation_mode = "XYZ"

    # The original mesh is intentionally not deformed: it has no clean bone
    # topology. This loop gives it a respectful marker motion without damaging
    # the recognizable source-model silhouette.
    poses = [
        (1, 0.0, 0.0, 0.0, -90.0),
        (24, 0.0, 0.0, 0.0, -90.0),
        (46, -0.18, -0.08, -8.0, -90.0),
        (78, -0.18, -0.08, -8.0, -90.0),
        (104, 0.0, 0.0, 0.0, -90.0),
        (128, 0.0, 0.0, 0.0, -90.0),
    ]

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 128
    bpy.context.scene.render.fps = 24
    for frame, z_offset, y_offset, bow_x, yaw_z in poses:
        bpy.context.scene.frame_set(frame)
        root.location = (0, y_offset, z_offset)
        root.rotation_euler = (math.radians(bow_x), 0, math.radians(yaw_z))
        root.keyframe_insert(data_path="location", frame=frame)
        root.keyframe_insert(data_path="rotation_euler", frame=frame)

    for fcurve in getattr(action, "fcurves", []):
        for point in fcurve.keyframe_points:
            point.interpolation = "BEZIER"


def export_model(root, meshes):
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    root.select_set(True)
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_PATH),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_frame_range=True,
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_materials="EXPORT",
        export_yup=True,
    )


def main():
    clear_scene()
    import_source()
    remove_placeholders()
    meshes = get_meshes()
    if not meshes:
        raise RuntimeError("No usable mesh found in source Frieza GLB.")
    simplify_meshes(meshes)
    root = normalize_model(meshes)
    create_salute_loop(root)
    export_model(root, meshes)
    total_vertices = sum(len(obj.data.vertices) for obj in meshes)
    total_faces = sum(len(obj.data.polygons) for obj in meshes)
    print(f"Exported Frieza waypoint: {OUTPUT_PATH}")
    print(f"Meshes={len(meshes)} vertices={total_vertices} faces={total_faces} ratio={DECIMATE_RATIO}")


if __name__ == "__main__":
    main()
