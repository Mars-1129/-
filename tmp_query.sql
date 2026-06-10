SELECT sr.id, sr."shotIndex" AS shot_index, sr.status, sr.render_path
FROM shot_renders sr
WHERE sr.creation_id = '7d6fcbe0-e043-4fc4-b49d-56afd69860f0'
ORDER BY sr."shotIndex";
