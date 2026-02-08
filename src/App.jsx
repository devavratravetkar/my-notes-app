import React, { useState, useEffect, useRef } from 'react';

// --- Utils & Constants ---
const GENERATE_ID = () => Math.random().toString(36).substr(2, 9);
const STORAGE_KEY = 'workflowy-clone-v13-9';

const DEFAULT_STATE = {
  tree: {
    id: 'root',
    text: 'Home',
    collapsed: false,
    children: [
      { id: '1', text: 'Welcome to v13.9 (Clean List Logic)', collapsed: false, children: [] },
      { id: '2', text: 'Go to the start of this node and mash Enter 5 times.', collapsed: false, children: [] },
      { id: '3', text: 'It will create exactly ONE empty node above, preventing a mess.', collapsed: false, children: [
         { id: '3-1', text: 'Then hit Backspace at the start to Merge it back perfectly.', collapsed: false, children: [] }
      ]},
    ]
  },
  viewRootId: 'root',
  focusId: null,
  darkMode: false
};

const cloneTree = (node) => JSON.parse(JSON.stringify(node));

const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const truncate = (str, n) => {
  return (str && str.length > n) ? str.substr(0, n - 1) + '...' : str;
};

export default function App() {
  // --- State ---
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
  
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIds, setMatchIds] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const [focusTrigger, setFocusTrigger] = useState(0);
  const [draggedId, setDraggedId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isAllExpanded, setIsAllExpanded] = useState(false);

  const searchInputRef = useRef(null);
  const lastFocusRef = useRef(null);
  const cursorGoalRef = useRef(null); // Can be 'start', 'end', or a specific number index

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tree,
      viewRootId,
      focusId,
      darkMode
    }));
  }, [tree, viewRootId, focusId, darkMode]);

  // --- Track Last Focus ---
  useEffect(() => {
    if (focusId && focusId !== viewRootId) {
      lastFocusRef.current = focusId;
    }
  }, [focusId, viewRootId]);

  // --- Theme ---
  const theme = darkMode ? {
    bg: '#1e1e1e', fg: '#e0e0e0', panel: '#2d2d2d', border: '#444', 
    highlight: '#007acc', dim: '#666', inputBg: '#2d2d2d',
    activeMatchBg: 'rgba(46, 160, 67, 0.25)', 
    activeMatchBorder: '#2ea043', 
    textHighlightBg: '#d7ba7d', textHighlightFg: '#000'
  } : {
    bg: '#fff', fg: '#333', panel: '#fff', border: '#eee', 
    highlight: '#007bff', dim: '#ccc', inputBg: '#fff',
    activeMatchBg: 'rgba(230, 255, 230, 1)', 
    activeMatchBorder: '#28a745', 
    textHighlightBg: '#fff3cd', textHighlightFg: '#000'
  };

  // --- Global Styles ---
  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.backgroundColor = theme.bg;
    document.body.style.color = theme.fg;
    document.body.style.transition = 'background-color 0.2s';
    return () => {
      document.body.style.margin = '';
      document.body.style.padding = '';
    };
  }, [theme.bg, theme.fg]);

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

  const adjustHeight = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
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

    const searchAndExpand = (node) => {
      let isMatch = false;
      if (node.text && node.text.toLowerCase().includes(query)) {
        matches.push(node.id);
        isMatch = true;
      }
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          const childHasMatch = searchAndExpand(child);
          if (childHasMatch) node.collapsed = false; 
        });
      }
      return isMatch || (node.children && node.children.some(c => c.text.toLowerCase().includes(query)));
    };

    searchAndExpand(newTree);
    setTree(newTree);
    setMatchIds(matches);
    setCurrentMatchIndex(0); 
  }, [searchQuery]); 

  // --- Search Actions ---
  const exitSearch = (targetId = null) => {
    setSearchQuery('');
    setMatchIds([]);
    setCurrentMatchIndex(-1);
    if (searchInputRef.current) searchInputRef.current.blur();
    
    const dest = targetId || lastFocusRef.current || viewRootId;
    setFocusId(dest);
    cursorGoalRef.current = 'end';
    setFocusTrigger(t => t + 1);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      exitSearch();
      return;
    }
    if (matchIds.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentMatchIndex + 1) % matchIds.length;
      setCurrentMatchIndex(nextIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIndex = (currentMatchIndex - 1 + matchIds.length) % matchIds.length;
      setCurrentMatchIndex(nextIndex);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentMatchIndex >= 0 && currentMatchIndex < matchIds.length) {
        exitSearch(matchIds[currentMatchIndex]);
      }
    }
  };

  // --- Focus Management ---
  useEffect(() => {
    if (focusId && document.activeElement !== searchInputRef.current) {
      setTimeout(() => {
        const el = document.getElementById(`input-${focusId}`);
        if (el) {
           el.focus();
           if (el.tagName === 'TEXTAREA') {
             adjustHeight(el);
             // Apply specific cursor goals
             if (typeof cursorGoalRef.current === 'number') {
                el.setSelectionRange(cursorGoalRef.current, cursorGoalRef.current);
             } else if (cursorGoalRef.current === 'start') {
               el.setSelectionRange(0, 0);
             } else if (cursorGoalRef.current === 'end') {
               const len = el.value.length;
               el.setSelectionRange(len, len);
             }
             cursorGoalRef.current = null;
           }
           const rect = el.getBoundingClientRect();
           if (rect.bottom > window.innerHeight || rect.top < 0) {
             el.scrollIntoView({ behavior: 'smooth', block: 'center' });
           }
        } else {
           const headerEl = document.getElementById(`input-${viewRootId}`);
           if (headerEl) {
             headerEl.focus();
             if (headerEl.tagName === 'TEXTAREA') adjustHeight(headerEl);
           }
        }
      }, 0);
    }
  }, [focusId, viewRootId, focusTrigger]); 

  // --- Initialization & Safety ---
  useEffect(() => {
    const cleanTree = cloneTree(tree);
    const pruneEmpty = (node) => {
      if (!node.children) return;
      node.children = node.children.filter(child => {
        const hasText = child.text && child.text.trim() !== '';
        const isFocused = child.id === focusId;
        const hasChildren = child.children && child.children.length > 0;
        const keep = hasText || isFocused || hasChildren;
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

    const checkAllExpanded = (node) => {
      if (node.children && node.children.length > 0 && node.collapsed) return false;
      if (node.children && node.children.length > 0) return node.children.every(checkAllExpanded);
      return true;
    };
    if (checkAllExpanded(cleanTree)) setIsAllExpanded(true);

    setTree(cleanTree);
    setFocusId(targetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // --- Render Helpers ---
  const HighlightedText = ({ text, query }) => {
    if (!query) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={i} style={{ backgroundColor: theme.textHighlightBg, color: theme.textHighlightFg, fontWeight: 'bold' }}>{part}</span>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  // --- Handlers ---
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
      let text = result.node.text;
      text = text.trim();
      text = text.replace(/\n{3,}/g, '\n\n');
      result.node.text = text;

      const hasChildren = result.node.children && result.node.children.length > 0;
      // Auto-delete empty nodes without children on blur
      if (text === '' && !hasChildren && result.parent) {
         const idx = result.parent.children.findIndex(c => c.id === id);
         if (idx !== -1) {
             result.parent.children.splice(idx, 1);
         }
      }
      setTree(newTree);
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
    if (isAllExpanded) handleCollapseAll(); else handleExpandAll();
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
       cursorGoalRef.current = 'start';
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
    cursorGoalRef.current = 'start';
    setFocusTrigger(t => t + 1);
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
        cursorGoalRef.current = 'start';
        setFocusTrigger(t => t + 1);
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
    cursorGoalRef.current = 'end';
    setFocusTrigger(t => t + 1);
  };

  const handleEnter = (e, id) => {
    e.preventDefault();
    const currentResult = findNodeAndParent(tree, id);
    if (!currentResult || !currentResult.node) return;
    if (currentResult.node.text === '') { handleShiftTab(e, id); return; }

    const { node, parent } = currentResult;
    const index = parent.children.findIndex(c => c.id === id);
    const el = e.target;
    const cursor = el.selectionStart || 0;
    const text = node.text || '';
    
    const newTree = cloneTree(tree);
    const resultInNewTree = findNodeAndParent(newTree, id);
    const parentInNewTree = resultInNewTree.parent;
    const nodeInNewTree = resultInNewTree.node;

    if (cursor === 0) {
        // ENTER AT START
        // 1. Check if previous sibling is ALREADY empty to prevent stacking
        if (index > 0) {
            const prevNode = parentInNewTree.children[index - 1];
            // If prev node is empty (and has no children), do nothing.
            if (prevNode.text.trim() === '' && (!prevNode.children || prevNode.children.length === 0)) {
                return;
            }
        }

        // 2. Insert Empty Node ABOVE
        const newNode = { id: GENERATE_ID(), text: '', collapsed: false, children: [] };
        parentInNewTree.children.splice(index, 0, newNode);
        
        setTree(newTree);
        // Keep focus on current node (don't move cursor)
    } else {
        // ENTER MIDDLE/END: Split
        const textBefore = text.slice(0, cursor);
        const textAfter = text.slice(cursor);
        nodeInNewTree.text = textBefore;
        const newNode = { id: GENERATE_ID(), text: textAfter, collapsed: false, children: [] };
        parentInNewTree.children.splice(index + 1, 0, newNode);
        setTree(newTree);
        setFocusId(newNode.id);
        cursorGoalRef.current = 'start';
        setFocusTrigger(t => t + 1);
    }
  };

  const handleBackspace = (e, id, text) => {
    const el = e.target;
    // Allow normal deletion if not at start
    if (el.selectionStart > 0) return;

    e.preventDefault();
    const newTree = cloneTree(tree);
    const result = findNodeAndParent(newTree, id);
    if (!result || !result.parent) return;
    const { node, parent } = result;
    
    // Safety: don't delete if children exist (unless we implement sophisticated merge-children logic later)
    // For now, if children exist, just do "..." logic or stop.
    // User requested "join to previous", which implies merging.
    if (node.children && node.children.length > 0) {
       // Only allow merge if previous sibling exists
       const index = parent.children.findIndex(c => c.id === id);
       if (index > 0) {
           const prevSibling = parent.children[index - 1];
           if (!prevSibling.children) prevSibling.children = [];
           // Adopt children
           prevSibling.children = [...prevSibling.children, ...node.children];
           prevSibling.collapsed = false;
       } else {
           // No previous sibling -> unindent with children
           handleShiftTab(e, id);
           return;
       }
    }

    const index = parent.children.findIndex(c => c.id === id);
    
    if (index > 0) {
      // MERGE with PREVIOUS
      const prevSibling = parent.children[index - 1];
      const cursorTarget = prevSibling.text.length; // Cursor goes to end of previous text
      
      prevSibling.text += node.text; // Append text
      
      // Delete current
      parent.children.splice(index, 1);
      
      setTree(newTree);
      setFocusId(prevSibling.id);
      cursorGoalRef.current = cursorTarget; // Set exact numeric cursor position
      setFocusTrigger(t => t + 1);
    } else {
      // Unindent if at top
      if (parent.id !== viewRootId) {
         handleShiftTab(e, id);
      }
    }
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
    cursorGoalRef.current = 'end';
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
    const el = e.currentTarget;
    if (el) {
      const { selectionStart, value } = el;
      if (direction === 'up' && selectionStart > 0) return; 
      if (direction === 'down' && selectionStart < value.length) return; 
    }

    e.preventDefault();
    const result = findNodeAndParent(tree, viewRootId);
    if(!result) return;
    const { node: viewRoot } = result;
    const flatList = getFlatList(viewRoot);
    const currentIndex = flatList.findIndex(n => n.id === id);
    if (direction === 'up') {
      if (currentIndex > 0) {
        setFocusId(flatList[currentIndex - 1].id);
        cursorGoalRef.current = 'end';
      } else if (viewRootId !== 'root') {
        setFocusId(viewRootId);
        cursorGoalRef.current = 'end';
      }
    } else if (direction === 'down') {
      if (currentIndex < flatList.length - 1) {
        setFocusId(flatList[currentIndex + 1].id);
        cursorGoalRef.current = 'start';
      }
    }
    setFocusTrigger(t => t + 1);
  };

  const handleItemKeyDown = (e, node) => {
    if (e.key === 'Enter' && !e.shiftKey) handleEnter(e, node.id);
    if (e.key === 'Backspace') handleBackspace(e, node.id, node.text);
    if (e.key === 'Tab' && !e.shiftKey) handleTab(e, node.id);
    if (e.key === 'Tab' && e.shiftKey) handleShiftTab(e, node.id);

    if (e.altKey && e.shiftKey && e.key === 'ArrowRight') {
       e.preventDefault();
       setViewRootId(node.id);
       setFocusId(node.id);
       cursorGoalRef.current = 'start';
    }
    if (e.altKey && e.shiftKey && e.key === 'ArrowLeft') {
       e.preventDefault();
       handleZoomOut();
    }

    if (e.altKey && !e.shiftKey && e.key === 'ArrowDown') {
       e.preventDefault();
       setCollapseState(node.id, false); 
    }
    if (e.altKey && !e.shiftKey && e.key === 'ArrowUp') {
       e.preventDefault();
       setCollapseState(node.id, true); 
    }

    if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'ArrowUp') handleMoveNode(e, node.id, 'up');
    if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'ArrowDown') handleMoveNode(e, node.id, 'down');

    if (!e.ctrlKey && !e.shiftKey && !e.altKey) {
       if (e.key === 'ArrowUp') handleArrow(e, node.id, 'up');
       if (e.key === 'ArrowDown') handleArrow(e, node.id, 'down');
    }
  };

  // --- Global Keyboard Shortcuts ---
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.altKey && e.key === '/') {
        e.preventDefault();
        setShowHelp(prev => !prev);
      }
      if (e.key === 'Escape') setShowHelp(false);
      
      if (e.altKey && e.shiftKey && e.key === 'ArrowLeft') {
         e.preventDefault();
         handleZoomOut();
      }
      if (e.altKey && e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        handleExpandAll();
      }
      if (e.altKey && e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault();
        handleCollapseAll();
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        const activeTag = document.activeElement.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
           e.preventDefault();
           if (lastFocusRef.current) {
             const exists = findNodeAndParent(tree, lastFocusRef.current);
             if (exists && exists.node) {
               setFocusId(lastFocusRef.current);
               cursorGoalRef.current = 'end';
               setFocusTrigger(t => t + 1);
               return;
             }
           }
           const result = findNodeAndParent(tree, viewRootId);
           if (result && result.node && (!result.node.children || result.node.children.length === 0)) {
               handleAddFirstChild();
           } else if (result && result.node && result.node.children.length > 0) {
               setFocusId(result.node.children[0].id);
               cursorGoalRef.current = 'start';
               setFocusTrigger(t => t+1);
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

    const commonTextStyle = {
      fontSize: '16px', lineHeight: '24px', padding: '4px', fontFamily: 'inherit',
      boxSizing: 'border-box', minHeight: '32px', display: 'block', width: '100%', margin: 0,
      whiteSpace: 'pre-wrap', overflowWrap: 'break-word'
    };

    return (
      <div key={node.id} style={{ marginLeft: '20px', position: 'relative', color: theme.fg }}>
        <div style={{ 
            display: 'flex', alignItems: 'flex-start', padding: '2px 0', borderRadius: '4px',
            opacity: isDimmed ? 0.4 : 1,
            background: isSelectedMatch ? theme.activeMatchBg : (isMatch ? theme.matchRowBg : 'transparent'),
            borderLeft: isSelectedMatch ? `3px solid ${theme.activeMatchBorder}` : '3px solid transparent'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '30px', justifyContent: 'flex-end', marginRight: '5px', paddingTop: '4px' }}>
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
               onClick={() => { setViewRootId(node.id); setFocusId(node.id); cursorGoalRef.current = null; }}
               draggable onDragStart={(e) => handleDragStart(e, node.id)}
               onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => handleDrop(e, node.id)}
             >•</span>
          </div>
          
          <div style={{ flex: 1, position: 'relative', display: 'grid' }}>
            <div style={{
               ...commonTextStyle,
               gridArea: '1 / 1',
               visibility: searchQuery ? 'visible' : 'hidden',
               pointerEvents: 'none', 
               color: theme.fg 
            }}>
               <HighlightedText text={node.text} query={searchQuery} />
            </div>

            <textarea
              ref={el => { if(el && isEditing) adjustHeight(el); }}
              id={`input-${node.id}`}
              value={node.text}
              onChange={(e) => { handleUpdateText(node.id, e.target.value); adjustHeight(e.target); }}
              onKeyDown={(e) => handleItemKeyDown(e, node)}
              onFocus={() => { setFocusId(node.id); }}
              onBlur={() => handleBlur(node.id)}
              rows={1}
              style={{
                ...commonTextStyle,
                gridArea: '1 / 1',
                border: 'none', outline: 'none', background: 'transparent', 
                resize: 'none', overflow: 'hidden',
                color: searchQuery ? 'transparent' : theme.fg, 
                caretColor: theme.fg, 
                zIndex: 1 
              }} 
            />
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
      const res = findNodeAndParent(tree, curr);
      if(res && res.node) { path.unshift(res.node); curr = res.parent ? res.parent.id : null; }
      else curr = null;
    }
    return (
      <div style={{ marginBottom: '20px', fontSize: '14px', color: theme.dim }}>
        {path.map((node, idx) => (
          <span key={node.id}>
             {idx > 0 && " > "}
             <span 
               style={{ cursor: 'pointer', textDecoration: 'underline', color: theme.highlight }} 
               onClick={() => { setViewRootId(node.id); setFocusId(node.id); cursorGoalRef.current = 'start'; }}
               title={node.text}
             >
               {truncate(node.text, 30) || 'Home'}
             </span>
          </span>
        ))}
      </div>
    );
  };

  const viewResult = findNodeAndParent(tree, viewRootId);
  if (!viewResult || !viewResult.node) return <div style={{color: theme.fg, padding: '40px'}}>Loading...</div>;
  const currentViewNode = viewResult.node;
  const isHeaderFocused = focusId === currentViewNode.id;

  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', padding: '40px' }}>
        
        {/* Header */}
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
                padding: '6px 30px 6px 10px', borderRadius: '4px', width: '220px', outline: 'none'
              }}
            />
            {searchQuery && (
              <button onClick={() => exitSearch()} style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: theme.dim, cursor: 'pointer', fontSize: '16px' }}>×</button>
            )}
            {matchIds.length > 0 && searchQuery && (
              <div style={{ position: 'absolute', right: '30px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: theme.dim }}>
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
        
        {/* Editor */}
        <div style={{ background: theme.panel, minHeight: '400px', borderRadius: '8px', padding: '10px' }}>
          {viewRootId !== 'root' && (
            <div style={{ marginBottom: '20px', marginLeft: '30px' }}>
               {isHeaderFocused ? (
                 <textarea
                   id={`input-${currentViewNode.id}`}
                   value={currentViewNode.text}
                   onChange={(e) => { handleUpdateText(currentViewNode.id, e.target.value); adjustHeight(e.target); }}
                   onKeyDown={handleHeaderKeyDown}
                   ref={el => { if(el) adjustHeight(el); }}
                   rows={1}
                   style={{ fontSize: '1.8rem', width: '100%', border: 'none', outline: 'none', fontWeight: 'bold', background: 'transparent', color: theme.fg, resize: 'none', overflow: 'hidden', fontFamily: 'inherit' }}
                 />
               ) : (
                 <div 
                   onClick={() => { setFocusId(currentViewNode.id); cursorGoalRef.current = 'start'; setFocusTrigger(t => t+1); }}
                   style={{ fontSize: '1.8rem', fontWeight: 'bold', color: theme.fg, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' }}
                 >
                   {currentViewNode.text || 'Untitled'}
                 </div>
               )}
            </div>
          )}
          {currentViewNode.children && currentViewNode.children.map(child => renderNode(child))}
          {(!currentViewNode.children || currentViewNode.children.length === 0) && (
             <div style={{ padding: '20px', color: theme.dim, cursor: 'pointer', userSelect: 'none' }} onClick={handleAddFirstChild}>
               <em>Empty. Click here or press Enter to add items.</em>
             </div>
          )}
        </div>

        {/* Modal */}
        {showHelp && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowHelp(false)}>
            <div style={{ background: theme.panel, padding: '30px', borderRadius: '8px', width: '400px', maxWidth: '90%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', color: theme.fg }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Shortcuts</h2>
                <button style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.dim }} onClick={() => setShowHelp(false)}>×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={styles.shortcutItem}><span>Ctrl + /</span> <span>Focus Search</span></div>
                <div style={styles.shortcutItem}><span>Alt + /</span> <span>Toggle Help</span></div>
                <div style={styles.shortcutItem}><span>Alt + Shift + Left/Right</span> <span>Zoom Out / In</span></div>
                <div style={styles.shortcutItem}><span>Alt + Shift + Up/Down</span> <span>Collapse/Expand All</span></div>
                <div style={styles.shortcutItem}><span>Alt + Up/Down</span> <span>Collapse/Expand Node</span></div>
                <div style={styles.shortcutItem}><span>Ctrl + Left/Right</span> <span>Move by Word</span></div>
                <div style={styles.shortcutItem}><span>Shift + Up/Down</span> <span>Move Node</span></div>
                <div style={styles.shortcutItem}><span>Tab / Shift+Tab</span> <span>Indent / Unindent</span></div>
                <div style={styles.shortcutItem}><span>Enter / Backspace</span> <span>Add / Delete (Merge)</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  shortcutItem: { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #444', paddingBottom: '5px' }
};