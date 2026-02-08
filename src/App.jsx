import React, { useState, useEffect } from 'react';

// --- Utils & Constants ---
const GENERATE_ID = () => Math.random().toString(36).substr(2, 9);
const STORAGE_KEY = 'workflowy-clone-v3';

const INITIAL_DATA = {
  id: 'root',
  text: 'Home',
  collapsed: false,
  children: [
    { id: '1', text: 'Welcome! Press ? or click "Help" for shortcuts.', collapsed: false, children: [] },
    { id: '2', text: 'Hover bullet to drag, Click to zoom', collapsed: false, children: [] },
    { id: '3', text: 'Click triangle to toggle children', collapsed: false, children: [
      { id: '3-1', text: 'Nested item 1', collapsed: false, children: [] },
    ]},
  ]
};

const cloneTree = (node) => JSON.parse(JSON.stringify(node));

export default function App() {
  const [tree, setTree] = useState(INITIAL_DATA);
  const [viewRootId, setViewRootId] = useState('root');
  const [focusId, setFocusId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [showHelp, setShowHelp] = useState(false); // NEW: Help Modal State

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setTree(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  }, [tree]);

  // --- Global Keyboard Shortcuts (Help) ---
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Toggle help with "?" (Shift + /)
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        setShowHelp(prev => !prev);
      }
      // Close help with Escape
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showHelp]);

  // --- Focus Management ---
  useEffect(() => {
    if (focusId) {
      const el = document.getElementById(`input-${focusId}`);
      if (el) el.focus();
    }
  }, [focusId, tree]);

  // --- Helpers ---
  const findNodeAndParent = (root, targetId, parent = null) => {
    if (root.id === targetId) return { node: root, parent };
    for (const child of root.children || []) {
      const result = findNodeAndParent(child, targetId, root);
      if (result) return result;
    }
    return null;
  };

  const isDescendant = (tree, sourceId, targetId) => {
    const { node: sourceNode } = findNodeAndParent(tree, sourceId);
    if (!sourceNode) return false;
    const findInSubtree = (n) => {
      if (n.id === targetId) return true;
      return n.children.some(findInSubtree);
    };
    return sourceNode.children.some(findInSubtree);
  };

  const getFlatList = (rootNode) => {
    const list = [];
    const traverse = (node) => {
      if (node.id !== rootNode.id) list.push(node);
      if (!node.collapsed && node.children) {
        node.children.forEach(traverse);
      }
    };
    traverse(rootNode);
    return list;
  };

  // --- Actions ---
  const handleUpdateText = (id, newText) => {
    const newTree = cloneTree(tree);
    const { node } = findNodeAndParent(newTree, id);
    if (node) node.text = newText;
    setTree(newTree);
  };

  const handleToggleCollapse = (e, id) => {
    e.stopPropagation();
    const newTree = cloneTree(tree);
    const { node } = findNodeAndParent(newTree, id);
    if (node) node.collapsed = !node.collapsed;
    setTree(newTree);
  };

  const handleEnter = (e, id) => {
    e.preventDefault();
    const newTree = cloneTree(tree);
    const { parent } = findNodeAndParent(newTree, id);
    if (!parent) return;
    const index = parent.children.findIndex(c => c.id === id);
    const newNode = { id: GENERATE_ID(), text: '', collapsed: false, children: [] };
    parent.children.splice(index + 1, 0, newNode);
    setTree(newTree);
    setFocusId(newNode.id);
  };

  const handleBackspace = (e, id, text) => {
    if (text !== '') return;
    e.preventDefault();
    const newTree = cloneTree(tree);
    const { parent } = findNodeAndParent(newTree, id);
    if (!parent) return;
    const index = parent.children.findIndex(c => c.id === id);
    let nextFocusId = null;
    if (index > 0) {
      let sibling = parent.children[index - 1];
      while (!sibling.collapsed && sibling.children.length > 0) {
        sibling = sibling.children[sibling.children.length - 1];
      }
      nextFocusId = sibling.id;
    } else {
      nextFocusId = parent.id !== viewRootId ? parent.id : null;
    }
    parent.children.splice(index, 1);
    setTree(newTree);
    if (nextFocusId) setFocusId(nextFocusId);
  };

  const handleTab = (e, id) => {
    e.preventDefault();
    const newTree = cloneTree(tree);
    const { parent } = findNodeAndParent(newTree, id);
    if (!parent) return;
    const index = parent.children.findIndex(c => c.id === id);
    if (index === 0) return;
    const prevSibling = parent.children[index - 1];
    const nodeToMove = parent.children[index];
    parent.children.splice(index, 1);
    prevSibling.children.push(nodeToMove);
    prevSibling.collapsed = false; 
    setTree(newTree);
    setFocusId(id);
  };

  const handleShiftTab = (e, id) => {
    e.preventDefault();
    const newTree = cloneTree(tree);
    const { node, parent } = findNodeAndParent(newTree, id);
    if (parent.id === viewRootId) return; 
    const { parent: grandParent } = findNodeAndParent(newTree, parent.id);
    if (!grandParent) return;
    const parentIndex = grandParent.children.findIndex(c => c.id === parent.id);
    const childIndex = parent.children.findIndex(c => c.id === id);
    parent.children.splice(childIndex, 1);
    grandParent.children.splice(parentIndex + 1, 0, node);
    setTree(newTree);
    setFocusId(id);
  };

  const handleArrow = (e, id, direction) => {
    e.preventDefault();
    const { node: viewRoot } = findNodeAndParent(tree, viewRootId);
    const flatList = getFlatList(viewRoot);
    const currentIndex = flatList.findIndex(n => n.id === id);
    if (direction === 'up' && currentIndex > 0) {
      setFocusId(flatList[currentIndex - 1].id);
    } else if (direction === 'down' && currentIndex < flatList.length - 1) {
      setFocusId(flatList[currentIndex + 1].id);
    }
  };

  // --- Drag and Drop ---
  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.target.style.opacity = '0.5';
  };
  const handleDragEnd = (e) => { e.target.style.opacity = '1'; setDraggedId(null); };
  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const newTree = cloneTree(tree);
    if (isDescendant(newTree, draggedId, targetId)) {
      alert("Cannot move node into its own child");
      return;
    }
    const { node: sourceNode, parent: sourceParent } = findNodeAndParent(newTree, draggedId);
    const { parent: targetParent } = findNodeAndParent(newTree, targetId);
    if (!sourceParent || !targetParent) return;
    const sourceIndex = sourceParent.children.findIndex(c => c.id === draggedId);
    sourceParent.children.splice(sourceIndex, 1);
    const { parent: freshTargetParent } = findNodeAndParent(newTree, targetId); 
    const targetIndex = freshTargetParent.children.findIndex(c => c.id === targetId);
    freshTargetParent.children.splice(targetIndex, 0, sourceNode);
    setTree(newTree);
  };

  // --- Renderers ---
  const renderNode = (node) => {
    const hasChildren = node.children && node.children.length > 0;
    return (
      <div key={node.id} style={styles.nodeContainer}>
        <div style={styles.nodeRow}>
          <div style={styles.controls}>
             <span 
               style={{...styles.toggle, visibility: hasChildren ? 'visible' : 'hidden', transform: node.collapsed ? 'rotate