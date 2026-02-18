import type { Document, NodeId, ValidationIssue } from "./types";
import { blockRegistry } from "./registry";

export function validateDocument(doc: Document): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const root = doc.nodes[doc.rootId];
  if (!root) {
    issues.push({
      nodeId: doc.rootId,
      level: "error",
      message: "Root node does not exist.",
      fieldPath: "rootId",
    });
    return issues;
  }
  if (root.type !== "page") {
    issues.push({
      nodeId: root.id,
      level: "error",
      message: "Root node must be a Page node.",
      fieldPath: "rootId",
    });
  }

  for (const node of Object.values(doc.nodes)) {
    // Graph integrity
    if (node.id === doc.rootId) {
      if (node.parentId !== null) {
        issues.push({
          nodeId: node.id,
          level: "warning",
          message: "Root node parentId should be null.",
          fieldPath: "parentId",
        });
      }
    } else {
      if (!node.parentId) {
        issues.push({
          nodeId: node.id,
          level: "warning",
          message: "Node is missing parentId.",
          fieldPath: "parentId",
        });
      } else {
        const parent = doc.nodes[node.parentId];
        if (!parent) {
          issues.push({
            nodeId: node.id,
            level: "error",
            message: "Node parentId points to a missing parent.",
            fieldPath: "parentId",
          });
        } else if (!parent.children.includes(node.id)) {
          issues.push({
            nodeId: node.id,
            level: "warning",
            message: "Parent does not include this node in its children list.",
            fieldPath: "parentId",
          });
        }
      }
    }

    const def = blockRegistry[node.type];

    // Leaf nodes should not have children.
    if (def.allowedChildren.length === 0 && node.children.length > 0) {
      issues.push({
        nodeId: node.id,
        level: "error",
        message: "This node type cannot contain children.",
        fieldPath: "children",
      });
    }

    // Allowed children types
    if (def.allowedChildren.length > 0) {
      for (const childId of node.children) {
        const child = doc.nodes[childId];
        if (!child) {
          issues.push({
            nodeId: node.id,
            level: "error",
            message: `Missing child node: ${childId}`,
            fieldPath: "children",
          });
          continue;
        }
        if (!def.allowedChildren.includes(child.type)) {
          issues.push({
            nodeId: node.id,
            level: "error",
            message: `Child type "${child.type}" is not allowed inside "${node.type}".`,
            fieldPath: "children",
          });
        }
      }
    }

    // Static child constraints
    if (def.constraints?.exactChildren !== undefined && node.children.length !== def.constraints.exactChildren) {
      issues.push({
        nodeId: node.id,
        level: "error",
        message: `This node must have exactly ${def.constraints.exactChildren} child(ren).`,
        fieldPath: "children",
      });
    }
    if (def.constraints?.minChildren !== undefined && node.children.length < def.constraints.minChildren) {
      issues.push({
        nodeId: node.id,
        level: "warning",
        message: `This node should have at least ${def.constraints.minChildren} child(ren).`,
        fieldPath: "children",
      });
    }
    if (def.constraints?.maxChildren !== undefined && node.children.length > def.constraints.maxChildren) {
      issues.push({
        nodeId: node.id,
        level: "warning",
        message: `This node should have at most ${def.constraints.maxChildren} child(ren).`,
        fieldPath: "children",
      });
    }

    // Type-specific validation via registry
    if (def.validate) {
      issues.push(...def.validate(node as never, { doc }));
    }
  }

  return issues;
}

export function validateNode(doc: Document, nodeId: NodeId): ValidationIssue[] {
  const node = doc.nodes[nodeId];
  if (!node) {
    return [
      {
        nodeId,
        level: "error",
        message: "Node does not exist.",
      },
    ];
  }
  const issues: ValidationIssue[] = [];
  const def = blockRegistry[node.type];

  // Parent/children integrity for this node
  if (node.id === doc.rootId) {
    if (node.parentId !== null) {
      issues.push({
        nodeId: node.id,
        level: "warning",
        message: "Root node parentId should be null.",
        fieldPath: "parentId",
      });
    }
  } else if (node.parentId && doc.nodes[node.parentId] && !doc.nodes[node.parentId].children.includes(node.id)) {
    issues.push({
      nodeId: node.id,
      level: "warning",
      message: "Parent does not include this node in its children list.",
      fieldPath: "parentId",
    });
  }

  if (def.allowedChildren.length === 0 && node.children.length > 0) {
    issues.push({
      nodeId: node.id,
      level: "error",
      message: "This node type cannot contain children.",
      fieldPath: "children",
    });
  }

  for (const childId of node.children) {
    const child = doc.nodes[childId];
    if (!child) {
      issues.push({
        nodeId: node.id,
        level: "error",
        message: `Missing child node: ${childId}`,
        fieldPath: "children",
      });
      continue;
    }
    if (!def.allowedChildren.includes(child.type)) {
      issues.push({
        nodeId: node.id,
        level: "error",
        message: `Child type "${child.type}" is not allowed inside "${node.type}".`,
        fieldPath: "children",
      });
    }
  }

  if (def.constraints?.exactChildren !== undefined && node.children.length !== def.constraints.exactChildren) {
    issues.push({
      nodeId: node.id,
      level: "error",
      message: `This node must have exactly ${def.constraints.exactChildren} child(ren).`,
      fieldPath: "children",
    });
  }

  if (def.validate) {
    issues.push(...def.validate(node as never, { doc }));
  }

  return issues;
}
