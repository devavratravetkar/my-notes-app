import React, { useState, useEffect } from 'react';

// --- Utils & Constants ---
const GENERATE_ID = () => Math.random().toString(36).substr(2, 9);
const STORAGE_KEY = 'workflowy-clone-v6';

const INITIAL_DATA = {
  id: 'root',
  text: 'Home',
  collapsed: false,
  children: [
    { id: '1', text: 'Welcome! Press Alt + / for shortcuts.', collapsed: false, children: [] },
    { id: '2', text: 'Ctrl + Right to Zoom (Focus moves to title)', collapsed: false, children: [] },
    { id: '3', text: 'You can now edit the Title when zoomed in!', collapsed: false, children: [] },
  ]
};

const cloneTree = (node) => JSON.parse(JSON.stringify(node));

export default function App() {
  const [tree, setTree] = useState(INITIAL_DATA);
  const [viewRootId, setViewRootId] = useState('root');
  const [focusId, setFocusId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

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

  // --- Focus Management ---
  useEffect(() => {
    if (focusId) {
      // Small timeout ensures DOM is ready after a view switch
      setTimeout(() => {
        const el = document.getElementById(`input-${focusId}`);
        if (el) {
           el.focus();
           // Optional: Move cursor to end of text
           // el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 0);
    }
  }, [focusId, viewRootId]); // Re-run when view changes

  // --- Global Keyboard Shortcuts ---
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // 1. Help Toggle (Alt + /)
      if (e.altKey && e.key === '/') {
        e.preventDefault();
        setShowHelp(prev => !prev);
      }
      if (e.key === 'Escape') setShowHelp(false);

      // 2. Zoom Out (Ctrl + Left)
      if (e.ctrlKey && e.key === 'ArrowLeft') {
         e.preventDefault();
         handleZoomOut();
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [tree, viewRootId, showHelp]);

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
    e && e.stopPropagation();
    const newTree = cloneTree(tree);
    const { node } = findNodeAndParent(newTree, id);
    if (node) node.collapsed = !node.collapsed;
    setTree(newTree);
  };
  
  const setCollapseState = (id, shouldCollapse) => {
    const newTree = cloneTree(tree);
    const { node } = findNodeAndParent(newTree, id);
    if (node) node.collapsed = shouldCollapse;
    setTree(newTree);
  };

  const handleZoomOut = () => {
     if (viewRootId === 'root') return;
     const { parent } = findNodeAndParent(tree, viewRootId);
     if (parent) {
       setViewRootId(parent.id);
       setFocusId(viewRootId); // Focus the node we just zoomed out of (the old header)
     }
  };

  const handleAddFirstChild = () => {
    const newTree = cloneTree(tree);
    const { node } = findNodeAndParent(newTree, viewRootId);
    if (!node) return;
    
    const newNode = { id: GENERATE_ID(), text: '', collapsed: false, children: [] };
    node.children.unshift(newNode); // Add to TOP of list
    
    setTree(newTree);
    setFocusId(newNode.id);
  };

  // --- Header (Title) Input Logic ---
  const handleHeaderKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddFirstChild();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const { node } = findNodeAndParent(tree, viewRootId);
      if (node.children && node.children.length > 0) {
        setFocusId(node.children[0].id);
      }
    }
  };

  // --- List Item Keyboard Logic ---
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
      // If we are deleting the first child, focus goes to the Header (if zoomed)
      if (parent.id === viewRootId && viewRootId !== 'root') {
        nextFocusId = viewRootId;
      } else if (parent.id !== viewRootId) {
        nextFocusId = parent.id;
      }
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

  const handleMoveNode = (e, id, direction) => {
    e.preventDefault();
    const newTree = cloneTree(tree);
    const { parent } = findNodeAndParent(newTree, id);
    if (!parent) return;
    
    const index = parent.children.findIndex(c => c.id === id);
    if (direction === 'up' && index > 0) {
       const temp = parent.children[index];
       parent.children[index] = parent.children[index - 1];
       parent.children[index - 1] = temp;
       setTree(newTree);
       setFocusId(id);
    } else if (direction === 'down' && index < parent.children.length - 1) {
       const temp = parent.children[index];
       parent.children[index] = parent.children[index + 1];
       parent.children[index + 1] = temp;
       setTree(newTree);
       setFocusId(id);
    }
  };

  const handleArrow = (e, id, direction) => {
    e.preventDefault();
    const { node: viewRoot } = findNodeAndParent(tree, viewRootId);
    const flatList = getFlatList(viewRoot);
    const currentIndex = flatList.findIndex(n => n.id === id);

    if (direction === 'up') {
      if (currentIndex > 0) {
        setFocusId(flatList[currentIndex - 1].id);
      } else if (viewRootId !== 'root') {
        // If at top of list and we are zoomed in, go to Header
        setFocusId(viewRootId);
      }
    } else if (direction === 'down') {
      if (currentIndex < flatList.length - 1) {
        setFocusId(flatList[currentIndex + 1].id);
      }
    }
  };

  const handleItemKeyDown = (e, node) => {
    if (e.key === 'Enter') handleEnter(e, node.id);
    if (e.key === 'Backspace') handleBackspace(e, node.id, node.text);
    if (e.key === 'Tab' && !e.shiftKey) handleTab(e, node.id);
    if (e.key === 'Tab' && e.shiftKey) handleShiftTab(e, node.id);

    // Ctrl + Right: Zoom In AND Focus
    if (e.ctrlKey && e.key === 'ArrowRight') {
       e.preventDefault();
       setViewRootId(node.id);
       setFocusId(node.id); // Explicitly focus the new header
    }
    
    // Expand/Collapse
    if (e.ctrlKey && e.key === 'ArrowDown') {
       e.preventDefault();
       setCollapseState(node.id, false); 
    }
    if (e.ctrlKey && e.key === 'ArrowUp') {
       e.preventDefault();
       setCollapseState(node.id, true); 
    }

    // Reorder
    if (e.shiftKey && e.key === 'ArrowUp') handleMoveNode(e, node.id, 'up');
    if (e.shiftKey && e.key === 'ArrowDown') handleMoveNode(e, node.id, 'down');

    // Navigation
    if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
       if (e.key === 'ArrowUp') handleArrow(e, node.id, 'up');
       if (e.key === 'ArrowDown') handleArrow(e, node.id, 'down');
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
               style={{
                 ...styles.toggle, 
                 visibility: hasChildren ? 'visible' : 'hidden', 
                 transform: node.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
               }}
               onClick={(e) => handleToggleCollapse(e, node.id)}
             >▼</span>
             <span 
               style={styles.bullet} 
               onClick={() => {
                 setViewRootId(node.id);
                 setFocusId(node.id);
               }}
               draggable onDragStart={(e) => handleDragStart(e, node.id)}
               onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => handleDrop(e, node.id)}
             >•</span>
          </div>
          <input
            id={`input-${node.id}`}
            value={node.text}
            onChange={(e) => handleUpdateText(node.id, e.target.value)}
            onKeyDown={(e) => handleItemKeyDown(e, node)}
            style={styles.input} autoComplete="off"
          />
        </div>
        {!node.collapsed && (
          <div style={styles.childrenBorder}>{node.children.map(child => renderNode(child))}</div>
        )}
      </div>
    );
  };

  const renderBreadcrumbs = () => {
    if (viewRootId === 'root') return null;
    const path = [];
    let curr = viewRootId;
    while(curr) {
      const { node, parent } = findNodeAndParent(tree, curr);
      if(node) path.unshift(node);
      curr = parent ? parent.id : null;
    }
    return (
      <div style={styles.breadcrumbs}>
        {path.map((node, idx) => (
          <span key={node.id}>
             {idx > 0 && " > "}
             <span style={styles.breadcrumbLink} onClick={() => {
               setViewRootId(node.id);
               setFocusId(node.id);
             }}>{node.text || 'Home'}</span>
          </span>
        ))}
      </div>
    );
  };

  const renderShortcutsModal = () => (
    <div style={styles.modalOverlay} onClick={() => setShowHelp(false)}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2>Keyboard Shortcuts</h2>
          <button style={styles.closeBtn} onClick={() => setShowHelp(false)}>×</button>
        </div>
        <div style={styles.shortcutList}>
          <div style={styles.shortcutItem}><span>Alt + /</span> <span>Toggle Help</span></div>
          <div style={styles.shortcutItem}><span>Ctrl + Right</span> <span>Zoom In</span></div>
          <div style={styles.shortcutItem}><span>Ctrl + Left</span> <span>Zoom Out</span></div>
          <div style={styles.shortcutItem}><span>Ctrl + Down</span> <span>Expand</span></div>
          <div style={styles.shortcutItem}><span>Ctrl + Up</span> <span>Collapse</span></div>
          <div style={styles.shortcutItem}><span>Shift + Up/Down</span> <span>Move Node</span></div>
          <div style={styles.shortcutItem}><span>Tab / Shift+Tab</span> <span>Indent / Unindent</span></div>
          <div style={styles.shortcutItem}><span>Enter / Backspace</span> <span>Add / Delete</span></div>
        </div>
      </div>
    </div>
  );

  const { node: currentViewNode } = findNodeAndParent(tree, viewRootId);
  if (!currentViewNode) return <div>Loading...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <h1 style={styles.header}>My Notes</h1>
        <button style={styles.helpBtn} onClick={() => setShowHelp(true)}>Help (Alt + /)</button>
      </div>
      
      {renderBreadcrumbs()}
      
      <div style={styles.editor}>
        {viewRootId !== 'root' && (
          // Editable Title Input
          <div style={styles.zoomedTitleContainer}>
             <input 
               id={`input-${currentViewNode.id}`} // Same ID scheme for Focus Logic
               style={styles.zoomedTitleInput}
               value={currentViewNode.text}
               onChange={(e) => handleUpdateText(currentViewNode.id, e.target.value)}
               onKeyDown={handleHeaderKeyDown}
               autoComplete="off"
             />
          </div>
        )}
        
        {currentViewNode.children.map(child => renderNode(child))}
        
        {currentViewNode.children.length === 0 && (
           <div style={styles.emptyState} onClick={handleAddFirstChild}>
             <em>Empty. Click here or press Enter to add items.</em>
           </div>
        )}
      </div>

      {showHelp && renderShortcutsModal()}
    </div>
  );
}

// --- Styles ---
const styles = {
  container: { fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', padding: '40px', color: '#333' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  header: { fontSize: '1.5rem', margin: 0, color: '#888' },
  helpBtn: { padding: '5px 10px', fontSize: '14px', cursor: 'pointer', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px' },
  breadcrumbs: { marginBottom: '20px', fontSize: '14px', color: '#666' },
  breadcrumbLink: { cursor: 'pointer', textDecoration: 'underline', color: '#007bff' },
  editor: { background: '#fff', minHeight: '400px' },
  
  // New Styles for the Header Input
  zoomedTitleContainer: { marginBottom: '20px', marginLeft: '30px' },
  zoomedTitleInput: { fontSize: '1.8rem', width: '100%', border: 'none', outline: 'none', fontWeight: 'bold', background: 'transparent' },

  nodeContainer: { marginLeft: '20px', position: 'relative' },
  nodeRow: { display: 'flex', alignItems: 'center', padding: '2px 0' },
  controls: { display: 'flex', alignItems: 'center', width: '30px', justifyContent: 'flex-end', marginRight: '5px' },
  toggle: { cursor: 'pointer', fontSize: '10px', color: '#aaa', marginRight: '4px', transition: 'transform 0.1s', userSelect: 'none' },
  bullet: { cursor: 'move', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', userSelect: 'none', fontSize: '20px', lineHeight: '1' },
  input: { border: 'none', outline: 'none', fontSize: '16px', width: '100%', padding: '4px', background: 'transparent' },
  childrenBorder: { borderLeft: '1px solid #eee', marginLeft: '29px' },
  emptyState: { padding: '20px', color: '#aaa', cursor: 'pointer', userSelect: 'none' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { background: '#fff', padding: '30px', borderRadius: '8px', width: '400px', maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' },
  shortcutList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  shortcutItem: { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '5px' }
};