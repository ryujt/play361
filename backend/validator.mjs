export function validateScoreRequest(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }

  const { board_size, komi, moves } = body;

  if (board_size === undefined || !Number.isInteger(board_size) || board_size < 2 || board_size > 25) {
    return 'board_size must be an integer between 2 and 25';
  }

  if (komi === undefined || typeof komi !== 'number') {
    return 'komi must be a number';
  }

  if (!Array.isArray(moves)) {
    return 'moves must be an array';
  }

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (!move || typeof move !== 'object') {
      return `moves[${i}] must be an object`;
    }
    if (move.color !== 'B' && move.color !== 'W') {
      return `moves[${i}].color must be 'B' or 'W'`;
    }
    if (typeof move.position !== 'string' || move.position.length === 0) {
      return `moves[${i}].position must be a non-empty string`;
    }
  }

  return null;
}

export function validateGenmoveRequest(body) {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }

  const { board_size, komi, moves, color_to_play } = body;

  if (board_size === undefined || !Number.isInteger(board_size) || board_size < 2 || board_size > 25) {
    return 'board_size must be an integer between 2 and 25';
  }

  if (komi === undefined || typeof komi !== 'number') {
    return 'komi must be a number';
  }

  if (!Array.isArray(moves)) {
    return 'moves must be an array';
  }

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (!move || typeof move !== 'object') {
      return `moves[${i}] must be an object`;
    }
    if (move.color !== 'B' && move.color !== 'W') {
      return `moves[${i}].color must be 'B' or 'W'`;
    }
    if (typeof move.position !== 'string' || move.position.length === 0) {
      return `moves[${i}].position must be a non-empty string`;
    }
  }

  if (color_to_play !== 'B' && color_to_play !== 'W') {
    return "color_to_play must be 'B' or 'W'";
  }

  if (body.rank !== undefined) {
    if (typeof body.rank !== 'string' || !/^\d+[kd]$/.test(body.rank)) {
      return "rank must be a string matching pattern \\d+[kd] (e.g. '20k', '5k', '1d', '7d')";
    }
  }

  return null;
}
