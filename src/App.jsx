import React, { useState, useEffect, useRef } from 'react';

// --- Utils & Constants ---
const GENERATE_ID = () => Math.random().toString(36).substr(2, 9);
const STORAGE_KEY = 'workflowy-clone-v11-complete';

const DEFAULT_STATE = {
  tree: {
    id: 'root',
    text: 'Home',
    collapsed: false,
    children: [
      { id: '1', text: 'Welcome to the complete v11!', collapsed: false, children: [] },
      { id: '2', text: 'Search is active: Type "Search" above.', collapsed: false, children: [] },
      { id: '3', text: 'All previous features (Drag/Drop, Fluid Move, Safety Delete) are intact.', collapsed: false, children: [
         { id: '3-1', text: 'Nested Item 1', collapsed: false, children: [] },
         { id: '3-2', text: 'Nested Item 2', collapsed: false, children: [] }
      ]},
    ]
  },
  viewRootId: 'root',
  focusId: null,
  darkMode: false
};

const cloneTree = (node) => JSON.parse(JSON.stringify(node));

export default function App() {
  // --- State Initialization ---
  const [state, setState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_STATE;
    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE;
      if (!parsed.tree) return { ...DEFAULT_STATE, tree: parsed }; 
      return parsed;
    } catch (e) {
      console.error("Load failed", e);
      return DEFAULT_STATE;
    }
  });

  const [tree, setTree] = useState(state.tree);
  const [viewRootId, setViewRootId] = useState(state.viewRootId || 'root');
  const [focusId, setFocusId] = useState(state.focusId);
  const [darkMode, setDarkMode] = useState(state.darkMode || false);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIds, setMatchIds] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const [focusTrigger, setFocusTrigger] = useState(0);
  const [draggedId, setDraggedId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isAllExpanded, setIsAllExpanded] = useState(false);

  const searchInputRef = useRef(null);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tree,
      viewRootId,
      focusId,
      darkMode
    }));
  }, [tree, viewRootId, focusId, darkMode]);

  // --- Theme Engine ---
  const theme = darkMode ? {
    bg: '#1e1e1e', fg: '#e0e0e0', panel: '#2d2d2d', border: '#444', 
    highlight: '#007acc', dim: '#666', inputBg: '#2d2d2d',
    matchBg: '#d7ba7d', matchFg: '#000'
  } : {
    bg: '#fff', fg: '#333', panel: '#fff', border: '#eee', 
    highlight: '#007bff', dim: '#ccc', inputBg: '#fff',
    matchBg: '#fff3cd', matchFg: '#000'
  };

  // --- Helpers ---
  const findNodeAndParent = (root, targetId, parent = null) => {
    if (!root) return null;
    if (root.id === targetId) return { node: root, parent };
    for (const child of root.children || []) {
      const result = findNodeAndParent(child, targetId, root);
      if (result) return result;
    }
    return null;
  };

  // --- Search Logic ---
  useEffect(() => {
    if (!searchQuery.trim()) {
      setMatchIds([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const query = searchQuery.toLowerCase();
    const matches = [];
    const newTree = cloneTree(tree);

    // Recursive search and Auto-Expand
    const searchAndExpand = (node) => {
      let isMatch = false;
      // Check current node
      if (node.text.toLowerCase().includes(query)) {
        matches.push(node.id);
        isMatch = true;
      }

      // Check children
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          const childHasMatch = searchAndExpand(child);
          if (childHasMatch) isMatch = true;
        });
      }

      // If this node or any child matched, force expand it
      if (isMatch) node.collapsed = false;
      return isMatch;
    };

    searchAndExpand(newTree);
    setTree(newTree);
    setMatchIds(matches);
    setCurrentMatchIndex(0); 
  }, [searchQuery]); 

  // --- Search Navigation ---
  const handleSearchKeyDown = (e) => {
    if (matchIds.length === 0) return;

    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const nextIndex = (currentMatchIndex + 1) % matchIds.length;
      setCurrentMatchIndex(nextIndex);
      if (e.key === 'Enter') {
        setFocusId(matchIds[nextIndex]);
        setFocusTrigger(t => t + 1);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIndex = (currentMatchIndex - 1 + matchIds.length) % matchIds.length;
      setCurrentMatchIndex(nextIndex);
    }
  };

  // --- Focus Management ---
  useEffect(() => {
    // Only auto-focus list items if we aren't using the search bar
    if (focusId && document.activeElement !== searchInputRef.current) {
      setTimeout(() => {
        const el = document.getElementById(`input-${focusId}`);
        if (el) {
           el.focus();
           const len = el.value.length; 
           el.setSelectionRange(len, len);
           const rect = el.getBoundingClientRect();
           if (rect.bottom > window.innerHeight || rect.top < 0) {
             el.scrollIntoView({ behavior: 'smooth', block: 'center' });
           }
        } else {
           // Fallback focus to header if node not found (e.g. collapsed)
           const headerEl = document.getElementById(`input-${viewRootId}`);
           if (headerEl) headerEl.focus();
        }
      }, 50);
    }
  }, [focusId, viewRootId, focusTrigger]); 

  // --- Initialization Logic ---
  useEffect(() => {
    const cleanTree = cloneTree(tree);
    const pruneEmpty = (node) => {
      if (!node.children) return;
      node.children = node.children.filter(child => {
        const keep = (child.text && child.text.trim() !== '') || (child.id === focusId);
        if (keep) pruneEmpty(child);
        return keep;
      });
    };
    pruneEmpty(cleanTree);

    let targetId = focusId;
    const focusResult = findNodeAndParent(cleanTree, targetId || 'non-existent');
    const foundFocus = focusResult ? focusResult.node : null;
    
    if (!foundFocus) {
      const viewResult = findNodeAndParent(cleanTree, viewRootId);
      const rootToUse = viewResult ? viewResult.node : cleanTree; 
      if (!viewResult && viewRootId !== 'root') setViewRootId('root');
      if (!rootToUse.children) rootToUse.children = [];
      if (rootToUse.children.length === 0) {
        const newNode = { id: GENERATE_ID(), text: '', collapsed: false, children: [] };
        rootToUse.children.push(newNode);
        targetId = newNode.id;
      } else {
        const lastChild = rootToUse.children[rootToUse.children.length - 1];
        if (lastChild.text === '') targetId = lastChild.id;
        else {
           const newNode = { id: GENERATE_ID(), text: '', collapsed: false, children: [] };
           rootToUse.children.push(newNode);
           targetId = newNode.id;
        }
      }
    }
    setTree(cleanTree);
    setFocusId(targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // --- Render Helper: Highlight Text ---
  const HighlightedText = ({ text, query }) => {
    if (!query) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={i} style={{ backgroundColor: theme.matchBg, color: theme.matchFg, fontWeight: 'bold' }}>{part}</span>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  // --- Handlers ---
  const isDescendant = (tree, sourceId, targetId) => {
    const sourceResult = findNodeAndParent(tree, sourceId);
    if (!sourceResult) return false;
    const { node: sourceNode } = sourceResult;
    const findInSubtree = (n) => {
      if (n.id === targetId) return true;
      return n.children && n.children.some(findInSubtree);
    };
    return sourceNode.children && sourceNode.children.some(findInSubtree);
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

  const handleUpdateText = (id, newText) => {
    const newTree = cloneTree(tree);
    const result = findNodeAndParent(newTree, id);
    if (result && result.node) {
      result.node.text = newText;
      setTree(newTree);
    }
  };

  const handleBlur = (id) => {
    const newTree = cloneTree(tree);
    const result = findNodeAndParent(newTree, id);
    if (result && result.node) {
      if (result.node.text.trim() === '' && result.node.children && result.node.children.length > 0) {
        result.node.text = "...";
        setTree(newTree);
      }
    }
  };

  const handleToggleCollapse = (e, id) => {
    e && e.stopPropagation();
    const newTree = cloneTree(tree);
    const result = findNodeAndParent(newTree, id);
    if (result && result.node) {
      result.node.collapsed = !result.node.collapsed;
      setTree(newTree);
    }
  };
  
  const setCollapseState = (id, shouldCollapse) => {
    const newTree = cloneTree(tree);
    const result = findNodeAndParent(newTree, id);
    if (result && result.node) {
      result.node.collapsed = shouldCollapse;
      setTree(newTree);
    }
  };

  const handleExpandAll = () => {
    const newTree = cloneTree(tree);
    const traverse = (node) => {
      if (node.children) {
        node.collapsed = false;
        node.children.forEach(traverse);
      }
    };
    traverse(newTree);
    setTree(newTree);
    setIsAllExpanded(true);
    setFocusTrigger(t => t + 1); 
  };

  const handleCollapseAll = () => {
    const newTree = cloneTree(tree);
    const traverse = (node) => {
      if (node.children) {
        node.collapsed = true;
        node.children.forEach(traverse);
      }
    };
    traverse(newTree);
    newTree.collapsed = false; 
    setTree(newTree);
    setIsAllExpanded(false);
    setFocusTrigger(t => t + 1); 
  };

  const toggleGlobalState = () => {
    if (isAllExpanded) {
      handleCollapseAll();
    } else {
      handleExpandAll();
    }
  };

  const handleZoomOut = () => {
     if (viewRootId === 'root') return;
     const newTree = cloneTree(tree);
     let dirty = false;
     if (focusId && focusId !== viewRootId) {
        const focusResult = findNodeAndParent(newTree, focusId);
        if (focusResult && focusResult.node && focusResult.parent) {
           const { node, parent } = focusResult;
           if (node.text.trim() === '' && (!node.children || node.children.length === 0)) {
               const index = parent.children.findIndex(c => c.id === focusId);
               if (index !== -1) {
                   parent.children.splice(index, 1);
                   dirty = true;
               }
           }
        }
     }
     const result = findNodeAndParent(newTree, viewRootId);
     if (result && result.parent) {
       setViewRootId(result.parent.id);
       setFocusId(viewRootId);
       if (dirty) setTree(newTree);
     }
  };

  const handleAddFirstChild = () => {
    const newTree = cloneTree(tree);
    const result = findNodeAndParent(newTree, viewRootId);
    if (!result || !result.node) return;
    const newNode = { id: GENERATE_ID(), text: '', collapsed: false, children: [] };
    result.node.children.unshift(newNode);
    setTree(newTree);
    setFocusId(newNode.id);
  };

  const handleHeaderKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddFirstChild();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const result = findNodeAndParent(tree, viewRootId);
      if (result && result.node && result.node.children.length > 0) {
        setFocusId(result.node.children[0].id);
      }
    }
  };

  const handleShiftTab = (e, id) => {
    e.preventDefault();
    const newTree = cloneTree(tree);
    const result = findNodeAndParent(newTree, id);
    if (!result || !result.parent) return;
    const { node, parent } = result;
    if (parent.id === viewRootId) return; 
    const grandParentResult = findNodeAndParent(newTree, parent.id);
    if (!grandParentResult || !grandParentResult.parent) return;
    const { parent: grandParent } = grandParentResult;
    const parentIndex = grandParent.children.findIndex(c => c.id === parent.id);
    const childIndex = parent.children.findIndex(c => c.id === id);
    parent.children.splice(childIndex, 1);
    grandParent.children.splice(parentIndex + 1, 0, node);
    setTree(newTree);
    setFocusId(id);
    setFocusTrigger(t => t + 1);
  };

  const handleEnter = (e, id) => {
    e.preventDefault();
    const currentResult = findNodeAndParent(tree, id);
    if (currentResult && currentResult.node && currentResult.node.text === '') {
       handleShiftTab(e, id);
       return;
    }
    const newTree = cloneTree(tree);
    const result = findNodeAndParent(newTree, id);
    if (!result || !result.parent) return;
    const { parent } = result;
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
    const result = findNodeAndParent(newTree, id);
    if (!result || !result.parent) return;
    if (result.node.children && result.node.children.length > 0) {
      result.node.text = "..."; 
      setTree(newTree);
      return; 
    }
    const { parent } = result;
    const index = parent.children.findIndex(c => c.id === id);
    let nextFocusId = null;
    if (index > 0) {
      let sibling = parent.children[index - 1];
      while (!sibling.collapsed && sibling.children && sibling.children.length > 0) {
        sibling = sibling.children[sibling.children.length - 1];
      }
      nextFocusId = sibling.id;
    } else {
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
    const result = findNodeAndParent(newTree, id);
    if (!result || !result.parent) return;
    const { parent } = result;
    const index = parent.children.findIndex(c => c.id === id);
    if (index === 0) return;
    const prevSibling = parent.children[index - 1];
    const nodeToMove = parent.children[index];
    parent.children.splice(index, 1);
    if(!prevSibling.children) prevSibling.children = [];
    prevSibling.children.push(nodeToMove);
    prevSibling.collapsed = false; 
    setTree(newTree);
    setFocusId(id);
    setFocusTrigger(t => t + 1);
  };

  const handleMoveNode = (e, id, direction) => {
    e.preventDefault();
    const newTree = cloneTree(tree);
    const result = findNodeAndParent(newTree, id);
    if (!result || !result.parent) return;
    const { node, parent } = result;
    const index = parent.children.findIndex(c => c.id === id);

    if (direction === 'up') {
      if (index > 0) {
         const prevSibling = parent.children[index - 1];
         if (!prevSibling.collapsed && prevSibling.children && prevSibling.children.length > 0) {
             parent.children.splice(index, 1);
             prevSibling.children.push(node);
         } else {
             parent.children[index] = prevSibling;
             parent.children[index - 1] = node;
         }
      } else {
         if (parent.id === viewRootId || parent.id === 'root') return;
         const gpResult = findNodeAndParent(newTree, parent.id);
         if (gpResult && gpResult.parent) {
             const { parent: grandParent } = gpResult;
             const parentIndex = grandParent.children.findIndex(c => c.id === parent.id);
             parent.children.splice(index, 1);
             grandParent.children.splice(parentIndex, 0, node);
         }
      }
    } else if (direction === 'down') {
      if (index < parent.children.length - 1) {
         const nextSibling = parent.children[index + 1];
         if (!nextSibling.collapsed && nextSibling.children && nextSibling.children.length > 0) {
             parent.children.splice(index, 1);
             nextSibling.children.unshift(node);
         } else {
             parent.children[index] = nextSibling;
             parent.children[index + 1] = node;
         }
      } else {
         if (parent.id === viewRootId || parent.id === 'root') return;
         const gpResult = findNodeAndParent(newTree, parent.id);
         if (gpResult && gpResult.parent) {
             const { parent: grandParent } = gpResult;
             const parentIndex = grandParent.children.findIndex(c => c.id === parent.id);
             parent.children.splice(index, 1);
             grandParent.children.splice(parentIndex + 1, 0, node);
         }
      }
    }
    setTree(newTree);
    setFocusId(id);
    setFocusTrigger(t => t + 1);
  };

  const handleArrow = (e, id, direction) => {
    e.preventDefault();
    const result = findNodeAndParent(tree, viewRootId);
    if(!result) return;
    const { node: viewRoot } = result;
    const flatList = getFlatList(viewRoot);
    const currentIndex = flatList.findIndex(n => n.id === id);
    if (direction === 'up') {
      if (currentIndex > 0) {
        setFocusId(flatList[currentIndex - 1].id);
      } else if (viewRootId !== 'root') {
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

    if (e.ctrlKey && e.key === 'ArrowRight') {
       e.preventDefault();
       setViewRootId(node.id);
       setFocusId(node.id);
    }
    if (e.ctrlKey && e.key === 'ArrowDown') {
       e.preventDefault();
       setCollapseState(node.id, false); 
    }
    if (e.ctrlKey && e.key === 'ArrowUp') {
       e.preventDefault();
       setCollapseState(node.id, true); 
    }
    
    // Check for fluid move (ensuring Ctrl is NOT pressed)
    if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowUp') handleMoveNode(e, node.id, 'up');
    if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowDown') handleMoveNode(e, node.id, 'down');

    if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
       if (e.key === 'ArrowUp') handleArrow(e, node.id, 'up');
       if (e.key === 'ArrowDown') handleArrow(e, node.id, 'down');
    }
  };

  // --- Global Keyboard Shortcuts ---
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Search
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      
      // Help
      if (e.altKey && e.key === '/') {
        e.preventDefault();
        setShowHelp(prev => !prev);
      }
      if (e.key === 'Escape') setShowHelp(false);
      
      // Zoom Out
      if (e.ctrlKey && e.key === 'ArrowLeft') {
         e.preventDefault();
         handleZoomOut();
      }

      // Global Expand/Collapse
      if (e.ctrlKey && e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        handleExpandAll();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault();
        handleCollapseAll();
      }

      // Enter on Empty State
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        const activeTag = document.activeElement.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
           const result = findNodeAndParent(tree, viewRootId);
           if (result && result.node && (!result.node.children || result.node.children.length === 0)) {
               e.preventDefault();
               handleAddFirstChild();
           }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [tree, viewRootId, showHelp]);

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
    const sourceResult = findNodeAndParent(newTree, draggedId);
    const targetResult = findNodeAndParent(newTree, targetId);
    if (!sourceResult || !sourceResult.parent || !targetResult || !targetResult.parent) return;
    const { node: sourceNode, parent: sourceParent } = sourceResult;
    const { parent: targetParent } = targetResult;
    const sourceIndex = sourceParent.children.findIndex(c => c.id === draggedId);
    sourceParent.children.splice(sourceIndex, 1);
    const freshTargetResult = findNodeAndParent(newTree, targetId);
    const freshTargetParent = freshTargetResult.parent;
    const targetIndex = freshTargetParent.children.findIndex(c => c.id === targetId);
    freshTargetParent.children.splice(targetIndex, 0, sourceNode);
    setTree(newTree);
    setFocusTrigger(t => t + 1);
    setFocusId(draggedId);
  };

  // --- Renderers ---
  const renderNode = (node) => {
    const hasChildren = node.children && node.children.length > 0;
    const isEditing = focusId === node.id;
    const isMatch = matchIds.includes(node.id);
    const isDimmed = searchQuery && !isMatch; 
    const isSelectedMatch = isMatch && matchIds[currentMatchIndex] === node.id;

    return (
      <div key={node.id} style={{ marginLeft: '20px', position: 'relative', color: theme.fg, opacity: isDimmed ? 0.25 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '2px 0', 
                      background: isSelectedMatch ? (darkMode ? '#333' : '#fff8dc') : 'transparent',
                      borderRadius: '4px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '30px', justifyContent: 'flex-end', marginRight: '5px' }}>
             <span 
               style={{
                 cursor: 'pointer', fontSize: '10px', color: theme.dim, marginRight: '4px', 
                 transition: 'transform 0.1s', userSelect: 'none',
                 visibility: hasChildren ? 'visible' : 'hidden', 
                 transform: node.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
               }}
               onClick={(e) => handleToggleCollapse(e, node.id)}
             >▼</span>
             <span 
               style={{
                 cursor: 'move', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                 color: theme.dim, userSelect: 'none', fontSize: '20px', lineHeight: '1'
               }}
               onClick={() => { setViewRootId(node.id); setFocusId(node.id); }}
               draggable onDragStart={(e) => handleDragStart(e, node.id)}
               onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => handleDrop(e, node.id)}
             >•</span>
          </div>
          
          <div style={{ flex: 1, position: 'relative' }}>
            {isEditing ? (
              <input
                id={`input-${node.id}`}
                value={node.text}
                onChange={(e) => handleUpdateText(node.id, e.target.value)}
                onKeyDown={(e) => handleItemKeyDown(e, node)}
                onBlur={() => handleBlur(node.id)}
                style={{
                  border: 'none', outline: 'none', fontSize: '16px', width: '100%', padding: '4px', 
                  background: 'transparent', color: theme.fg, fontFamily: 'inherit'
                }} 
                autoComplete="off"
              />
            ) : (
              <div 
                onClick={() => setFocusId(node.id)}
                style={{ fontSize: '16px', padding: '4px', minHeight: '26px', cursor: 'text' }}
              >
                <HighlightedText text={node.text} query={searchQuery} />
              </div>
            )}
          </div>
        </div>
        {!node.collapsed && (
          <div style={{ borderLeft: `1px solid ${theme.border}`, marginLeft: '29px' }}>
            {node.children && node.children.map(child => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  const renderBreadcrumbs = () => {
    if (viewRootId === 'root') return null;
    const path = [];
    let curr = viewRootId;
    while(curr) {
      const result = findNodeAndParent(tree, curr);
      if(result && result.node) {
        path.unshift(result.node);
        curr = result.parent ? result.parent.id : null;
      } else {
        curr = null;
      }
    }
    return (
      <div style={{ marginBottom: '20px', fontSize: '14px', color: theme.dim }}>
        {path.map((node, idx) => (
          <span key={node.id}>
             {idx > 0 && " > "}
             <span 
               style={{ cursor: 'pointer', textDecoration: 'underline', color: theme.highlight }} 
               onClick={() => { setViewRootId(node.id); setFocusId(node.id); }}>{node.text || 'Home'}</span>
          </span>
        ))}
      </div>
    );
  };

  const renderShortcutsModal = () => (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowHelp(false)}>
      <div style={{ background: theme.panel, padding: '30px', borderRadius: '8px', width: '400px', maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', color: theme.fg }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>Keyboard Shortcuts</h2>
          <button style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.dim }} onClick={() => setShowHelp(false)}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={styles.shortcutItem}><span>Ctrl + /</span> <span>Focus Search</span></div>
          <div style={styles.shortcutItem}><span>Alt + /</span> <span>Toggle Help</span></div>
          <div style={styles.shortcutItem}><span>Ctrl + Shift + Down</span> <span>Expand All</span></div>
          <div style={styles.shortcutItem}><span>Ctrl + Shift + Up</span> <span>Collapse All</span></div>
          <div style={styles.shortcutItem}><span>Ctrl + Right / Left</span> <span>Zoom In / Out</span></div>
          <div style={styles.shortcutItem}><span>Ctrl + Down / Up</span> <span>Expand / Collapse</span></div>
          <div style={styles.shortcutItem}><span>Shift + Up/Down</span> <span>Move Node</span></div>
          <div style={styles.shortcutItem}><span>Tab / Shift+Tab</span> <span>Indent / Unindent</span></div>
          <div style={styles.shortcutItem}><span>Enter / Backspace</span> <span>Add / Delete</span></div>
        </div>
      </div>
    </div>
  );

  const viewResult = findNodeAndParent(tree, viewRootId);
  if (!viewResult || !viewResult.node) return <div style={{color: theme.fg, padding: '40px'}}>Loading...</div>;
  const currentViewNode = viewResult.node;

  return (
    <div style={{ 
      fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', padding: '40px', 
      color: theme.fg, minHeight: '100vh', backgroundColor: theme.bg, transition: 'background-color 0.2s' 
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0, color: theme.dim }}>My Notes</h1>
        <div style={{ position: 'relative' }}>
          <input 
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search... (Ctrl + /)"
            style={{
              background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.fg,
              padding: '6px 10px', borderRadius: '4px', width: '220px', outline: 'none'
            }}
          />
          {matchIds.length > 0 && (
            <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: theme.dim }}>
              {currentMatchIndex + 1}/{matchIds.length}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }} onClick={() => setDarkMode(!darkMode)} title="Toggle Theme">{darkMode ? '☀️' : '🌙'}</button>
          <button style={{ background: 'none', border: 'none', color: theme.highlight, cursor: 'pointer', fontSize: '14px', padding: '0', textDecoration: 'underline' }} onClick={toggleGlobalState}>{isAllExpanded ? 'Collapse All' : 'Expand All'}</button>
          <button style={{ padding: '5px 10px', fontSize: '14px', cursor: 'pointer', background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.fg }} onClick={() => setShowHelp(true)}>Help (Alt + /)</button>
        </div>
      </div>
      {renderBreadcrumbs()}
      <div style={{ background: theme.panel, minHeight: '400px', borderRadius: '8px', padding: '10px' }}>
        {viewRootId !== 'root' && (
          <div style={{ marginBottom: '20px', marginLeft: '30px' }}>
             <input 
               id={`input-${currentViewNode.id}`}
               value={currentViewNode.text}
               onChange={(e) => handleUpdateText(currentViewNode.id, e.target.value)}
               onKeyDown={handleHeaderKeyDown}
               style={{ fontSize: '1.8rem', width: '100%', border: 'none', outline: 'none', fontWeight: 'bold', background: 'transparent', color: theme.fg }}
               autoComplete="off"
             />
          </div>
        )}
        {currentViewNode.children && currentViewNode.children.map(child => renderNode(child))}
        {(!currentViewNode.children || currentViewNode.children.length === 0) && (
           <div style={{ padding: '20px', color: theme.dim, cursor: 'pointer', userSelect: 'none' }} onClick={handleAddFirstChild}>
             <em>Empty. Click here or press Enter to add items.</em>
           </div>
        )}
      </div>
      {showHelp && renderShortcutsModal()}
    </div>
  );
}

const styles = {
  shortcutItem: { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #444', paddingBottom: '5px' }
};