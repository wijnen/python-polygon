// Module for handling polygons

// Data structures: {{{

// A polyline is stored as an array:
//   [[x, y], [x, y], [x, y], ...]
// A polygon is a polyline with the last point equal to the first point.
// A shape is an array of polylines. solids are clockwise polygons (normal into surface),
//   holes are counterclockwise polygons (normal out of surface).

// Interface:
//   invert(shape) -> shape: invert all polygon directions.
//   merge(poly1, poly2) -> shape: merge two polygons; return array of new polygons, or null if there are no intersections.
//   unite(shape) -> shape: merge overlapping polygons in shape.
//   intersect(shape) -> shape: merge overlapping holes in shape.
//   offset(shape, distance) -> shape: offset all polygons of shape towards hole (for positive distance); non-polygons are not changed. Used for compensating for line cut width.
//   bbox(shape) -> [l, w]: compute bounding box of shape.
//   translate(shape, [x, y]) -> shape: translate shape.
//   svg([shape, ...])-> string: encode shapes as svg (each shape is a separate path).
//   svgdata([shape, ...]) -> string: as above, then encode result as data url.
// }}}

var svg_sep = 5;	// Space between objects when building svg.
var svg_lw = 1;		// Line width in svg.

// Math helpers. {{{
function invert(shape) {
	var ret = [];
	for (var s = 0; s < shape.length; ++s) {
		poly = shape[s];
		ret.push([]);
		for (var c = poly.length - 1; c >= 0; --c)
			ret[s].push(poly[c]);
	}
	return ret;
}

function diff(A, B) {
	return [A[0] - B[0], A[1] - B[1]];
}

function inner(A, B) {
	return A[0] * B[0] + A[1] * B[1];
}

function len(A) {
	return Math.sqrt(inner(A, A));
}

function mul(A, d) {
	return [A[0] * d, A[1] * d];
}

function div(A, d) {
	return [A[0] / d, A[1] / d];
}

function normalize(A) {
	return div(A, len(A));
}

// This function computes the projection of the target point on the line through origin and online.
// Returns [distance on line, distance from line].
// Distance from line is positive if it is on the right when looking along the line, negative if it is on the left.
function project(origin, online, target) {
	var d = diff(online, origin);
	var line = normalize(d);
	var v = diff(target, origin);
	var dist_on = inner(line, v);
	//var l = len(v);
	//var factor = inner(line, v) / l;
	//var dist = l * factor;

	// Find distance from line, by projecting on perpendicular line.
	var perp = [line[1], -line[0]];	// This is already a unit vector.
	var dist_from = inner(perp, v);
	return [dist_on, dist_from];
}
// }}}

function Segment(A) {
	this.path = [];
	for (var i = 0; i < A.length; ++i)
		this.path.push(A[i]);
	this.start = null;
	this.end = null;
}

function Intersection(pos, e1, s1, e2, s2) {
	this.pos = pos;
	s1.start = this;
	s2.start = this;
	e1.end = this;
	e2.end = this;
	this.segments = [[e1, false], [s1, true], [e2, false], [s2, true]];
}

function show_intersection(intersection, which) {
	console.info('show intersection', which === undefined ? 'all' : which);
	for (var i = 0; i < intersection.length; ++i) {
		if (which !== undefined && i != which)
			continue;
		var p = intersection[i];
		console.info('position', p.pos);
		for (var s = 0; s < p.segments.length; ++s) {
			var l = p.segments[s];
			var len = l[0].path.length;
			if (l[1])
				console.info('-->', l[0].path[1], l[0].path[len - 1], l[2]);
			else
				console.info('<--', l[0].path[len - 2], l[0].path[0], l[2]);
		}
	}
}

function is_hole(poly) {
	// Return true if polygon is a hole (goes counter clockwise), false otherwise.
	// poly is rotated so leftmost point is first.
	var angles = compute_angles(poly);
	return angles[0] < angles[1];
}

function check_hole(poly, ref, hole) {
	// Return true if ref is a hole in solid poly, or a solid in hole poly.
	// Return false if ref is a hole in hole poly, or a solid in solid poly.
	// Return null otherwise.
	return null;	// TODO.
}

function compute_angles(poly) {
	// Compute angles of starting and ending segment.
	var others = [poly[1], poly[poly.length - 2]];
	var ret = [];
	for (var c = 0; c < others.length; ++c) {
		var dx = others[c][0] - poly[0][0];
		var dy = others[c][1] - poly[0][1];
		ret.push(Math.atan2(dy, dx));
	}
}

function merge(poly1, poly2) { // {{{
	// Only handle polygons, not open polylines.
	for (var i = 0; i < 2; ++i) {
		if (poly1[0][i] != poly1[poly1.length - 1][i] || poly2[0][i] != poly2[poly2.length - 1][i]) {
			console.info('At least one of the polylines is not a polygon', i, poly1[0][i], poly1[poly1.length - 1][i], poly2[0][i], poly2[poly2.length - 1][i]);
			return null;
		}
	}
	// Use segments p..p+1
	// Break every polygon into segments.
	// Remove inner segments.
	// At first intersection, rotate polygon so the intersection is the first point.
	// Start breaking it up at subsequent intersections.
	// Store p1 segments while scanning.
	// p2 is array of poly2 segments.
	// Every segment in p1 is checked against all parts of p2.
	// At the end, all p2 segments are added.
	// After that, internal segments are removed and loops care closed.
	var p1 = new Segment(poly1);	// Current (possibly rotated) polygon.
	var p2 = [new Segment(poly2)];
	// All intersections that were found. If empty, polygons are not yet rotated.
	// Each element is {'pos': [x, y], 'segments': [Segment, ...]}.
	// Each Segment is {'path': [[x, y], ...], 'start': intersection, 'end': intersection}.
	var intersection = [];
	// Loop over p1. First rotate, then cut on intersections. {{{
	// On rotate, create intersection and add both starts and ends from p1 and p2 to it.
	// On cut, cut p1 and p2, create new intersection with both new starts and ends on it.
	for (var ip1 = 0; ip1 < p1.path.length - 1; ++ip1) {
		for (var ip2 = 0; ip2 < p2.length; ++ip2) {
			var segment1 = [];
			for (var c = 0; c < 2; ++c)
				segment1.push(p1.path[ip1 + 1][c] - p1.path[ip1][c]);
			var len1 = len(segment1);
			var dB = project(p1.path[ip1], p1.path[ip1 + 1], p2[ip2].path[0]);
			for (var jp2 = 0; jp2 < p2[ip2].path.length - 1; ++jp2) {
				// check if points are equal.
				var new_point = [];
				var dA = dB;
				dB = project(p1.path[ip1], p1.path[ip1 + 1], p2[ip2].path[jp2 + 1]);
				if (p1.path[ip1][0] == p2[ip2].path[jp2][0] && p1.path[ip1][1] == p2[ip2].path[jp2][1]) {
					// These points are equal; cut polygon without adding a new point.
					new_point = p1.path[ip1];
				}
				else {
					if (((dA[1] >= 0) && (dB[1] >= 0)) || ((dA[1] <= 0) && (dB[1] <= 0))) {
						// Both points are on the same side of the line; ignore.
						// Special handling when point is on the line.
						if (dA[1] == 0) {
							var f = dA[0] / len1;
							if (f <= 0 || f >= 1)
								continue;
							// Point A is on p1.
							new_point = p2[ip2].path[jp2];
							p1.path.splice(ip1 + 1, 0, new_point);
						}
						else
							continue;
					}
					var fromA = dA[1] * (dB[0] - dA[0]) / (dA[1] - dB[1]);
					var f = (dA[0] + fromA) / len1;
					if (f <= 0 || f >= 1) {
						// Intersection is not on the segment; ignore.
						// Special handling when point is on the line.
						if (f == 0) {
							// AB goes through start of p1.
							new_point = p1.path[ip1];
							p2[ip2].path.splice(jp2 + 1, 0, new_point);
						}
						else
							continue;
					}
					else {
						for (var c = 0; c < 2; ++c)
							new_point.push(p1.path[ip1][c] + f * segment1[c]);
						p1.path.splice(ip1 + 1, 0, new_point);
						p2[ip2].path.splice(jp2 + 1, 0, new_point);
					}
				}
				if (intersection.length == 0) {
					// Rotate polygons.
					var part1 = p1.path.splice(0, ip1 + 1);
					p1.path.pop();	// Remove last point, which is the same as the first point.
					p1.path = p1.path.concat(part1);	// Add first part of polygon.
					p1.path.push(new_point);	// Add last point equal to first point.
					// rotate p2.
					part1 = p2[0].path.splice(0, jp2 + 1);
					p2[0].path.pop();	// Remove last point, which is the same as the first point.
					p2[0].path = p2[0].path.concat(part1);	// Add first part of polygon.
					p2[0].path.push(new_point);	// Add last point equal to first point.
					// Add intersection.
					intersection.push(new Intersection(new_point, p1, p1, p2[0], p2[0]));
				}
				else {
					// Cut off and store p1 segment.
					var path1 = p1.path.splice(ip1 + 1, p1.path.length - (ip1 + 1), new_point);
					ip1 = 0;
					var new_p1 = new Segment(path1);
					new_p1.end = p1.end;
					for (var s = 0; s < p1.end.segments.length; ++s) {
						if (p1.end.segments[s][1] == false && p1.end.segments[s][0] === p1) {
							// This was the polyline ending at this intersection. Replace it with new_p1.
							p1.end.segments[s][0] = new_p1;
							break;
						}
					}
					// Split p2 segment.
					var path2 = p2[ip2].path.splice(jp2 + 1, p2[ip2].path.length - (jp2 + 1), new_point);
					var new_p2 = new Segment(path2);
					new_p2.end = p2[ip2].end;
					for (var s = 0; s < p2[ip2].end.segments.length; ++s) {
						if (p2[ip2].end.segments[s][1] == false && p2[ip2].end.segments[s][0] === p2[ip2]) {
							// This was the polyline ending at this intersection. Replace it with new_p2.
							p2[ip2].end.segments[s][0] = new_p2;
							break;
						}
					}
					intersection.push(new Intersection(new_point, p1, new_p1, p2[ip2], new_p2));
					p2.push(new_p2);
					p1 = new_p1;
				}
			}
		}
	} // }}}
	// intersection is now a list of all intersections, with links to their segments.
	// If there are no intersections, nothing has been cut.
	if (intersection.length == 0) {
		// TODO: If polygons are disjoint, return null. Otherwise remove one and return the other.
		return null;
	}
	// Remove connected "inner" segments and merge connected segments. {{{
	for (var i = 0; i < intersection.length; ++i) {
		var p = intersection[i];
		// Sort segments by exit angle. // {{{
		for (var s = 0; s < p.segments.length; ++s) {
			var seg = p.segments[s];
			var d;
			if (seg[1]) {
				if (!(seg[0].path[0] == p.pos)) {
					console.error('start segment does not start at intersection', seg[0].path[0], p.pos, seg[0].path)
					return;
				}
				d = [seg[0].path[1][0] - seg[0].path[0][0], seg[0].path[1][1] - seg[0].path[0][1]];
			}
			else {
				var l = seg[0].path.length;
				if (!(seg[0].path[l - 1] == p.pos)) {
					console.error('end segment does not end at intersection', seg[0].path[l - 1], p.pos, seg[0].path)
					return;
				}
				d = [seg[0].path[l - 2][0] - seg[0].path[l - 1][0], seg[0].path[l - 2][1] - seg[0].path[l - 1][1]];
			}
			seg.push(Math.atan2(d[1], d[0]));
		}
		p.segments.sort(function(a, b) {
			return a[2] - b[2] || b[1] - a[1];
		});
		// Make sure the edge lines are opposite directions.
		if (p.segments[0][1] == p.segments[p.segments.length - 1][1]) {
			for (var s = 0; s < p.segments.length - 1; ++s) {
				if (p.segments[s][1] == true && p.segments[s + 1][1] == false) {
					// Rotate list.
					var part1 = p.segments.splice(0, s + 1);
					p.segments = p.segments.concat(part1);
					break;
				}
			}
		}
		show_intersection(intersection, i);
		// }}}
		// Remove inner segments. {{{
		for (var s = 0; s < p.segments.length; ++s) {
			if (p.segments[s][1] ^ p.segments[(s + 1) % p.segments.length][1])
				continue;
			// One of the segments needs to be removed.
			var is_start = p.segments[s][1];
			var idx = s + (is_start ? 1 : 0);
			var other = p.segments[idx][0][is_start ? 'end' : 'start'];
			for (var o = 0; o < other.segments.length; ++o) {
				if (other.segments[o][0] === p.segments[idx] && other.segments[o][1] == !is_start) {
					other.segments.splice(o, 1);
					break;
				}
			}
			p.segments.splice(idx, 1);
			--s;	// Compensate for removal of element.
		}
		// }}}
		var ret = [];
		while (p.segments.length > 0) {
			// All same-direction pairs have been cleaned up.
			// Connect first two segments until there are none left.
			var A = p.segments[0][0];
			var B = p.segments[1][0];
			if (A === B) {
				// This is a closed polygon. Record it.
				if (A.length >= 4) {
					// Only record polygons with nonzero surface.
					console.info('found polygon', A.path);
					ret.push(A.path);
				}
				p.segments.splice(0, 2);
				continue;
			}
			// Make sure A is the incoming segment, B the outgoing one.
			if (p.segments[0][1] == true) {
				var C = A;
				A = B;
				B = C;
			}
			// Make A the new segment.
			console.info('merge', A.path[0], A.path[A.path.length - 2], A.path[A.path.length - 1], B.path[0], B.path[1], B.path[B.path.length - 1]);
			A.path.pop();
			A.path = A.path.concat(B.path);
			for (var o = 0; o < B.end.segments.length; ++o) {
				if (B.end.segments[o][0] === B && B.end.segments[o][1] == false) {
					B.end.segments[o] = [A, false];
					A.end = B.end;
					break;
				}
			}
			p.segments.splice(0, 2);
		}
	} // }}}
	// Rotate all polygons so left-most point is first. // {{{
	for (var r = 0; r < ret.length; ++r) {
		var left = null;
		for (var p = 0; p < ret[r].length; ++p) {
			if (left === null || ret[r][p][0] < ret[r][left][0])
				left = p;
		}
		if (left > 0) {
			var first = ret[r].splice(0, left + 1, ret[r][left]);
			ret[r].pop();
			ret[r] = ret[r].concat(first);
		}
	} // }}}
	ret.sort(function(a, b) { // {{{
		// Sort by left-most point. Use angle for sorting equal points.
		if (a[0][0] != b[0][0])
			return a[0][0] - b[0][0];
		if (a[0][1] != b[0][1])
			return a[0][1] - b[0][1];
		var angs = [];
		var ab = [a, b];
		for (var iab = 0; iab < ab.length; ++iab) {
			angs.push(Math.max(compute_angles(ab[iab])));
		}
		return angs[0] - angs[1];
	}); // }}}
	// Remove unconnected inner solids and outer holes. {{{
	for (var r = 0; r < ret.length; ++r) {
		var hole = is_hole(ret[r]);
		var checked = false;
		// FIXME: This is wrong.
		for (var i = r - 1; i >= 0; --i) {
			var a = check_hole(ret[i], ret[r][0], hole);
			if (a === true) {
				checked = true;
				break;
			}
			else if (a === false) {
				// Remove this polygon.
				ret.splice(r, 1);
				--r;
				checked = true;
				break;
			}
		}
		if (!checked && hole) {
			// This is an outer hole; remove it.
			ret.splice(r, 1);
			--r;
		}
	} // }}}
	return ret;
}
// }}}

function unite(shape) { // {{{
	var ret = [shape[0]];
	for (var s = 1; s < shape.length; ++s) {
		var new_poly = shape[s];
		for (var r = 0; r < ret.length; ++r) {
			n = merge(ret[r], new_poly);
			if (n === null) {
				ret.push(new_poly);
				continue;
			}
			ret.splice(r, 1, n[0]);
			for (var nn = 1; nn < n.length; ++nn)
				ret.push(n[nn]);
		}
	}
	return shape;
}
// }}}

function intersect(shape) { // {{{
	return invert(unite(invert(shape)));
}
// }}}

function offset(shape, distance) { // {{{
	// TODO
	return shape;
}
// }}}

function bbox(shape) { // {{{
	var ret = [NaN, NaN, NaN, NaN];
	for (var p = 0; p < shape.length; ++p) {
		var poly = shape[p];
		for (var c = 0; c < poly.length; ++c) {
			if (!(poly[c][0] >= ret[0]))
				ret[0] = poly[c][0];
			if (!(poly[c][1] >= ret[1]))
				ret[1] = poly[c][1];
			if (!(poly[c][0] <= ret[2]))
				ret[2] = poly[c][0];
			if (!(poly[c][0] <= ret[3]))
				ret[3] = poly[c][0];
		}
	}
	return ret;
}
// }}}

function translate(shape, xy) { // {{{
	var ret = [];
	for (var p = 0; p < shape.length; ++p) {
		var poly = shape[p];
		ret.push([]);
		for (var c = 0; c < poly.length; ++c)
			ret[p].push([poly[c][0] + xy[0], poly[c][1] + xy[1]]);
	}
	return ret;
}
// }}}

function svg() { // {{{
	var bb = [-svg_sep, 0];
	var x_pos = [0];
	for (var a = 0; a < arguments.length; ++a) {
		var a_bbox = bbox(arguments[a]);
		x_pos.push(a_bbox[2]);
		bb[0] += a_bbox[2] + svg_sep;
		if (bb[1] < a_bbox[3])
			bb[1] = a_bbox[3];
	}
	var data = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg width="' + bb[0] + 'mm" height="' + bb[1] + 'mm" viewBox="0 0 ' + bb[0] + ' ' + bb[1] + '" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:xlink="http://www.w3.org/1999/xlink">\n<g fill="none" stroke="#ff0000" style="stroke-width:' + svg_lw + '">\n'
	for (var a = 0; a < arguments.length; ++a) {
		var shape = arguments[a];
		data += '<path d="';
		for (var p = 0; p < shape.length; ++p) {
			var poly = shape[p];
			data += 'M' + (x_pos[a] + poly[0][0]) + ',' + poly[0][1];
			for (var c = 1; c < poly.length - 1; ++c)
				data += 'l' + poly[c][0] + ',' + poly[c][1];
			if (poly[0] == poly[poly.length - 1])
				data += 'z';
			else
				data += 'l' + poly[poly.length - 1][0] + ',' + poly[poly.length - 1][1];
		}
		data += '"/>\n'
	}
	data += '</g>\n</svg>\n';
	return data;
}
// }}}

function svgdata() { // {{{
	return 'data:image/svg,' + encodeURIComponent(svg(arguments));
}
// }}}

// vim: set foldmethod=marker :
