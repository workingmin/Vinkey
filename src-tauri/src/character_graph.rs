use petgraph::{
    algo::connected_components,
    graph::{Graph, NodeIndex},
    Undirected,
};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::time::Instant;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterScore {
    pub character_id: String,
    pub degree: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterGraphStats {
    pub node_count: usize,
    pub edge_count: usize,
    pub connected_components: usize,
    pub isolated_node_count: usize,
    pub average_degree: f64,
    pub max_degree: usize,
    pub top_characters: Vec<CharacterScore>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterGraphBenchmark {
    pub stats: CharacterGraphStats,
    pub load_micros: u64,
    pub stats_p50_micros: u64,
    pub stats_p95_micros: u64,
    pub path_p50_micros: u64,
    pub path_p95_micros: u64,
    pub path_found: bool,
    pub iterations: usize,
}

fn percentile(values: &mut [u64], percentile: usize) -> u64 {
    if values.is_empty() {
        return 0;
    }
    values.sort_unstable();
    let index = ((values.len() - 1) * percentile / 100).min(values.len() - 1);
    values[index]
}

pub fn summarize(
    nodes: impl IntoIterator<Item = String>,
    edges: impl IntoIterator<Item = (String, String)>,
) -> CharacterGraphStats {
    let mut graph = Graph::<String, (), Undirected>::new_undirected();
    let mut indexes = HashMap::<String, NodeIndex>::new();
    for node in nodes {
        indexes
            .entry(node.clone())
            .or_insert_with(|| graph.add_node(node));
    }
    for (source, target) in edges {
        if source == target {
            continue;
        }
        let source_index = *indexes
            .entry(source.clone())
            .or_insert_with(|| graph.add_node(source));
        let target_index = *indexes
            .entry(target.clone())
            .or_insert_with(|| graph.add_node(target));
        if graph.find_edge(source_index, target_index).is_none() {
            graph.add_edge(source_index, target_index, ());
        }
    }

    let mut scores: Vec<CharacterScore> = graph
        .node_indices()
        .map(|index| CharacterScore {
            character_id: graph[index].clone(),
            degree: graph.neighbors(index).count(),
        })
        .collect();
    scores.sort_by(|left, right| {
        right
            .degree
            .cmp(&left.degree)
            .then_with(|| left.character_id.cmp(&right.character_id))
    });
    let node_count = graph.node_count();
    let edge_count = graph.edge_count();
    let degree_sum: usize = scores.iter().map(|score| score.degree).sum();
    CharacterGraphStats {
        node_count,
        edge_count,
        connected_components: if node_count == 0 {
            0
        } else {
            connected_components(&graph)
        },
        isolated_node_count: scores.iter().filter(|score| score.degree == 0).count(),
        average_degree: if node_count == 0 {
            0.0
        } else {
            degree_sum as f64 / node_count as f64
        },
        max_degree: scores.first().map(|score| score.degree).unwrap_or(0),
        top_characters: scores.into_iter().take(20).collect(),
    }
}

pub fn shortest_path(
    source: &str,
    target: &str,
    max_hops: usize,
    edges: impl IntoIterator<Item = (String, String)>,
) -> Option<Vec<String>> {
    if source == target {
        return Some(vec![source.to_string()]);
    }
    let mut graph = Graph::<String, (), Undirected>::new_undirected();
    let mut indexes = HashMap::<String, NodeIndex>::new();
    let index_for = |graph: &mut Graph<String, (), Undirected>,
                     indexes: &mut HashMap<String, NodeIndex>,
                     id: String| {
        *indexes
            .entry(id.clone())
            .or_insert_with(|| graph.add_node(id))
    };
    for (left, right) in edges {
        if left == right {
            continue;
        }
        let left_index = index_for(&mut graph, &mut indexes, left);
        let right_index = index_for(&mut graph, &mut indexes, right);
        if graph.find_edge(left_index, right_index).is_none() {
            graph.add_edge(left_index, right_index, ());
        }
    }
    let source_index = *indexes.get(source)?;
    let target_index = *indexes.get(target)?;
    let mut queue = VecDeque::from([source_index]);
    let mut parents = HashMap::<NodeIndex, NodeIndex>::new();
    let mut depths = HashMap::<NodeIndex, usize>::from([(source_index, 0)]);
    while let Some(current) = queue.pop_front() {
        if current == target_index {
            let mut path = vec![current];
            let mut cursor = current;
            while let Some(parent) = parents.get(&cursor) {
                path.push(*parent);
                cursor = *parent;
            }
            path.reverse();
            return Some(path.into_iter().map(|index| graph[index].clone()).collect());
        }
        let next_depth = depths[&current] + 1;
        if next_depth > max_hops {
            continue;
        }
        for neighbor in graph.neighbors(current) {
            if depths.contains_key(&neighbor) {
                continue;
            }
            depths.insert(neighbor, next_depth);
            parents.insert(neighbor, current);
            queue.push_back(neighbor);
        }
    }
    None
}

pub fn benchmark(
    nodes: Vec<String>,
    edges: Vec<(String, String)>,
    iterations: usize,
) -> CharacterGraphBenchmark {
    let stats = summarize(nodes.clone(), edges.clone());
    let iterations = iterations.clamp(1, 100);
    let source = nodes.first().cloned().unwrap_or_default();
    let target = nodes.last().cloned().unwrap_or_default();
    let mut stats_times = Vec::with_capacity(iterations);
    let mut path_times = Vec::with_capacity(iterations);
    let mut path_found = false;
    for _ in 0..iterations {
        let started = Instant::now();
        let _ = summarize(nodes.clone(), edges.clone());
        stats_times.push(started.elapsed().as_micros() as u64);
        let started = Instant::now();
        path_found = !source.is_empty()
            && !target.is_empty()
            && shortest_path(&source, &target, 3, edges.clone()).is_some();
        path_times.push(started.elapsed().as_micros() as u64);
    }
    CharacterGraphBenchmark {
        stats,
        load_micros: 0,
        stats_p50_micros: percentile(&mut stats_times, 50),
        stats_p95_micros: percentile(&mut stats_times, 95),
        path_p50_micros: percentile(&mut path_times, 50),
        path_p95_micros: percentile(&mut path_times, 95),
        path_found,
        iterations,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarizes_sparse_graph_and_isolates() {
        let stats = summarize(
            vec!["a".into(), "b".into(), "c".into(), "d".into()],
            vec![("a".into(), "b".into()), ("b".into(), "c".into())],
        );
        assert_eq!(stats.node_count, 4);
        assert_eq!(stats.edge_count, 2);
        assert_eq!(stats.connected_components, 2);
        assert_eq!(stats.isolated_node_count, 1);
        assert_eq!(stats.max_degree, 2);
    }

    #[test]
    fn finds_bounded_shortest_path() {
        let edges = vec![
            ("a".into(), "b".into()),
            ("b".into(), "c".into()),
            ("c".into(), "d".into()),
        ];
        assert_eq!(shortest_path("a", "d", 2, edges.clone()), None);
        assert_eq!(
            shortest_path("a", "d", 3, edges),
            Some(vec!["a", "b", "c", "d"])
        );
    }

    #[test]
    fn benchmarks_target_shaped_sparse_graph() {
        let nodes = (0..2_000)
            .map(|index| format!("c{index}"))
            .collect::<Vec<_>>();
        let edges = (0..1_999)
            .map(|index| (format!("c{index}"), format!("c{}", index + 1)))
            .collect::<Vec<_>>();
        let benchmark = benchmark(nodes, edges, 3);
        assert_eq!(benchmark.stats.node_count, 2_000);
        assert_eq!(benchmark.stats.edge_count, 1_999);
        assert_eq!(benchmark.iterations, 3);
    }
}
