import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// --- Utils & Constants ---
const GENERATE_ID = () => Math.random().toString(36).substr(2, 9);
const STORAGE_KEY = 'workflowy-clone-v13-37';

const DEFAULT_STATE = {
  tree: {
    id: 'root',
    text: 'Home',
    collapsed: false,
    children: [
      { id: '1', text: 'Welcome to v13.37 (Build Fix)', collapsed: false, children: [] },
      { id: '2', text: 'We removed the unused variables that were causing the Netlify build to fail.', collapsed: false, children: [] },
      { id: '3', text: 'Everything else is identical to the high-performance v13.36 build.', collapsed: false, children: [] }
    ]
  },
  viewRootId: 'root',
  focusId: null,
  darkMode: false
};

// --- HELPERS ---

const sanitizeTree = (node, seenIds = new Set()) => {
  if (!node.id || seenIds.has(node.id)) node.id = GENERATE_ID();
  seenIds.add(node.id);
  if (node.children) node.children.forEach(child => sanitizeTree(child, seenIds));
  return node;
};

const treeToString = (node, depth = 0) => {
  let output = '';
  if (node.id !== 'root') {
    const indent = '  '.repeat(depth);
    output += `${indent}- ${node.text}\n`;
  }
  if (node.children) {
    node.children.forEach(child => {
      output += treeToString(child, node.id === 'root' ? 0 : depth + 1);
    });
  }
  return output;
};

const parseTextToNodes = (text) => {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  const rootNodes = [];
  const stack = [{ level: -1, children: rootNodes }];
  lines.forEach(line => {
    if (!line.trim()) return;
    const leading = line.match(/^(\s*)/);
    const indent = leading ? leading[1].replace(/\t/g, '    ').length : 0;
    const clean = line.replace(/^\s*([-*]|\d+\.)\s+/, '').trim();
    const node = { id: GENERATE_ID(), text: clean, collapsed: false, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= indent) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ level: indent, children: node.children });
  });
  return rootNodes;
};

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const truncate = (str, n) => {
  return (str && str.length > n) ? str.substr(0, n - 1) + '...' : str;
};

// Helper to find a node and its parent in the tree
const findRes = (root, id, parent = null) => {
  if (root.id === id) return { node: root, parent };
  if (root.children) {
    for (let child of root.children) {
      const res = findRes(child, id, root);
      if (res) return res;
    }
  }
  return null;
};

// Helper to find parent path
const findPath = (root, targetId) => {
    if (root.id === targetId) return [root];
    if (root.children) {
        for (const child of root.children) {
            const path = findPath(child, targetId);
            if (path) return [root, ...path];
        }
    }
    return null;
};

// Helper for structural sharing updates (simple properties)
const updateNodeInTree = (node, id, transform) => {
  if (node.id === id) return transform(node);
  if (!node.children) return node;
  
  const childIndex = node.children.findIndex(c => c.id === id || containsId(c, id));
  if (childIndex === -1) return node;

  const newChildren = [...node.children];
  newChildren[childIndex] = updateNodeInTree(newChildren[childIndex], id, transform);
  return { ...node, children: newChildren };
};

const containsId = (node, id) => {
  if (node.id === id) return true;
  return node.children && node.children.some(c => containsId(c, id));
};

// --- MEMOIZED NODE COMPONENT ---
const NodeItem = React.memo(({ 
  node, 
  isFocused, 
  isMatch, 
  isSelectedMatch, 
  searchQuery, 
  theme, 
  handlers 
}) => {
  
  const commonTextStyle = {
    fontSize: '16px', lineHeight: '24px', padding: '4px', fontFamily: 'inherit',
    minHeight: '32px', boxSizing: 'border-box', width: '100%',
    whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word'
  };

  return (
    <div style={{ marginLeft: '20px', position: 'relative', color: theme.fg }}>
      <div style={{ 
          display: 'flex', alignItems: 'flex-start', padding: '2px 0', borderRadius: '4px',
          opacity: (searchQuery && !isMatch) ? 0.4 : 1,
          background: isSelectedMatch ? theme.activeMatchBg : (isMatch ? theme.matchRowBg : 'transparent'),
          borderLeft: isSelectedMatch ? `3px solid ${theme.activeMatchBorder}` : '3px solid transparent'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '30px', justifyContent: 'flex-end', marginRight: '5px', paddingTop: '4px' }}>
           <span 
             style={{
               cursor: 'pointer', fontSize: '10px', color: theme.dim, marginRight: '4px', 
               transition: 'transform 0.1s', userSelect: 'none',
               visibility: (node.children && node.children.length > 0) ? 'visible' : 'hidden', 
               transform: node.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'
             }}
             onClick={(e) => handlers.onToggleCollapse(e, node.id)}
           >▼</span>
           <span 
             style={{
               cursor: 'move', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
               color: theme.dim, userSelect: 'none', fontSize: '20px', lineHeight: '1'
             }}
             onClick={() => handlers.onZoom(node.id)}
             draggable onDragStart={(e) => handlers.onDragStart(e, node.id)}
             onDragEnd={handlers.onDragEnd} onDragOver={(e) => e.preventDefault()}
             onDrop={(e) => handlers.onDrop(e, node.id)}
           >•</span>
        </div>
        
        <div style={{ flex: 1, position: 'relative', display: 'grid' }}>
          <div style={{ ...commonTextStyle, gridArea: '1 / 1', visibility: 'hidden', pointerEvents: 'none' }}>
             {node.text + ' '}
          </div>

          <textarea
            id={`input-${node.id}`}
            value={node.text}
            onChange={(e) => handlers.onUpdateText(node.id, e.target.value)}
            onKeyDown={(e) => handlers.onKeyDown(e, node)}
            onFocus={() => handlers.onFocus(node.id)}
            onBlur={() => handlers.onBlur(node.id)}
            onPaste={(e) => handlers.onPaste(e, node.id)}
            rows={1}
            style={{
              ...commonTextStyle,
              gridArea: '1 / 1',
              border: 'none', outline: 'none', background: 'transparent', 
              resize: 'none', overflow: 'hidden',
              color: searchQuery ? 'transparent' : theme.fg, 
              caretColor: theme.fg, 
              zIndex: 1, height: '100%', display: 'block'
            }} 
          />
          
          {searchQuery && (
            <div style={{ ...commonTextStyle, gridArea: '1 / 1', visibility: 'visible', pointerEvents: 'none', color: theme.fg, zIndex: 2 }}>
               {node.text.split(new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi')).map((part, i) => 
                  part.toLowerCase() === searchQuery.toLowerCase() 
                  ? <span key={i} style={{ backgroundColor: theme.textHighlightBg, color: theme.textHighlightFg, fontWeight: 'bold' }}>{part}</span> 
                  : part
               )}
            </div>
          )}
        </div>
      </div>

      {!node.collapsed && node.children && (
        <div style={{ borderLeft: `1px solid ${theme.border}`, marginLeft: '29px' }}>
          {node.children.map(child => (
            <NodeItem 
              key={child.id} 
              node={child} 
              isFocused={child.id === handlers.focusedId}
              isMatch={handlers.matchIds && handlers.matchIds.includes(child.id)}
              isSelectedMatch={handlers.matchIds && handlers.matchIds[handlers.matchIndex] === child.id}
              searchQuery={searchQuery}
              theme={theme}
              handlers={handlers}
            />
          ))}
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.node === next.node && 
    prev.isFocused === next.isFocused &&
    prev.isMatch === next.isMatch &&
    prev.isSelectedMatch === next.isSelectedMatch &&
    prev.searchQuery === next.searchQuery &&
    prev.theme === next.theme
  );
});


export default function App() {
  const [state] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return DEFAULT_STATE;
      const parsed = JSON.parse(saved);
      if (!parsed || !parsed.tree) return DEFAULT_STATE;
      return { ...DEFAULT_STATE, ...parsed, tree: sanitizeTree(parsed.tree) };
    } catch { return DEFAULT_STATE; }
  });

  const [tree, setTree] = useState(state.tree);
  const [viewRootId, setViewRootId] = useState(() => window.location.hash.replace('#','') || state.viewRootId || 'root');
  const [focusId, setFocusId] = useState(state.focusId);
  const [darkMode, setDarkMode] = useState(state.darkMode || false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [matchIds, setMatchIds] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const [draggedId, setDraggedId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const searchInputRef = useRef(null);
  const lastFocusRef = useRef(null);
  const cursorGoalRef = useRef(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tree, viewRootId, focusId, darkMode }));
  }, [tree, viewRootId, focusId, darkMode]);

  useEffect(() => { if(viewRootId) window.location.hash = viewRootId; }, [viewRootId]);
  useEffect(() => { if(focusId && focusId !== viewRootId) lastFocusRef.current = focusId; }, [focusId, viewRootId]);

  // --- Search Logic ---
  useEffect(() => {
    if (!searchQuery.trim()) { setMatchIds([]); setCurrentMatchIndex(-1); return; }
    const matches = [];
    const traverse = (n) => {
        if(n.text.toLowerCase().includes(searchQuery.toLowerCase())) matches.push(n.id);
        if(n.children) n.children.forEach(traverse);
    };
    traverse(tree);
    setMatchIds(matches);
    setCurrentMatchIndex(0);
  }, [searchQuery, tree]);

  // --- Handlers (Memoized) ---

  const handleUpdateText = useCallback((id, newText) => {
    setTree(prev => updateNodeInTree(prev, id, n => ({ ...n, text: newText })));
  }, []);

  const handleToggleCollapse = useCallback((e, id) => {
    e && e.stopPropagation();
    let rescueId = null;
    if(focusId) {
       const path = findPath(tree, focusId);
       if(path && path.some(n=>n.id===id) && id!==focusId) rescueId = id;
    }
    setTree(prev => updateNodeInTree(prev, id, n => ({ ...n, collapsed: !n.collapsed })));
    if(rescueId) { setFocusId(rescueId); cursorGoalRef.current='start'; }
  }, [focusId, tree]);

  const handleZoom = useCallback((id) => {
    setViewRootId(id);
    setFocusId(id);
    cursorGoalRef.current = 'start';
  }, []);

  const handleZoomOut = useCallback(() => {
      if(viewRootId === 'root') return;
      const res = findRes(tree, viewRootId);
      if(res && res.parent) {
          setViewRootId(res.parent.id);
          setFocusId(viewRootId);
          cursorGoalRef.current = 'start';
      }
  }, [tree, viewRootId]);

  const handleGoHome = useCallback(() => {
      setViewRootId('root');
      setFocusId('root');
  }, []);

  const handleAddFirstChild = useCallback(() => {
    setTree(prev => {
        const newTree = JSON.parse(JSON.stringify(prev));
        const res = findRes(newTree, viewRootId);
        if (!res || !res.node) return prev;
        const newNode = { id: GENERATE_ID(), text: '', collapsed: false, children: [] };
        if(!res.node.children) res.node.children = [];
        res.node.children.unshift(newNode);
        setTimeout(() => { setFocusId(newNode.id); cursorGoalRef.current='start'; },0);
        return newTree;
    });
  }, [viewRootId]);

  // --- Complex Logic ---
  
  const runEnter = useCallback((e, id) => {
      e.preventDefault();
      skipBlurRef.current = true;
      const cursor = e.target.selectionStart || 0;
      setTree(prev => {
          const newTree = JSON.parse(JSON.stringify(prev));
          const res = findRes(newTree, id);
          if(!res || !res.parent) return prev;
          const {node, parent} = res;
          
          if(cursor === 0) {
              const idx = parent.children.findIndex(c=>c.id===id);
              const newNode = {id: GENERATE_ID(), text:'', collapsed:false, children:[]};
              parent.children.splice(idx, 0, newNode);
              setTimeout(() => { setFocusId(newNode.id); cursorGoalRef.current='start'; },0);
          } else {
              const textAfter = node.text.slice(cursor);
              node.text = node.text.slice(0, cursor);
              const newNode = {id: GENERATE_ID(), text:textAfter, collapsed:false, children:[]};
              if(node.children && node.children.length > 0 && !node.collapsed) {
                  node.children.unshift(newNode);
              } else {
                  const idx = parent.children.findIndex(c=>c.id===id);
                  parent.children.splice(idx+1, 0, newNode);
              }
              setTimeout(() => { setFocusId(newNode.id); cursorGoalRef.current='start'; },0);
          }
          return newTree;
      });
  }, []);

  const runBackspace = useCallback((e, id) => {
      if(e.target.selectionStart > 0) return;
      e.preventDefault();
      skipBlurRef.current = true;
      setTree(prev => {
          const newTree = JSON.parse(JSON.stringify(prev));
          const res = findRes(newTree, id);
          if(!res || !res.parent) return prev;
          const {node, parent} = res;
          const idx = parent.children.findIndex(c=>c.id===id);
          
          if(node.children && node.children.length > 0) {
              if(idx===0 && parent.id !== viewRootId) {
                  const gpRes = findRes(newTree, parent.id);
                  if(gpRes && gpRes.parent) {
                      const pIdx = gpRes.parent.children.findIndex(c=>c.id===parent.id);
                      parent.children.splice(idx,1);
                      gpRes.parent.children.splice(pIdx+1, 0, node);
                      setTimeout(() => { setFocusId(id); cursorGoalRef.current='end'; },0);
                  }
              }
              return newTree; 
          }

          if(idx > 0) {
              const prevNode = parent.children[idx-1];
              if(prevNode.children && prevNode.children.length > 0 && !prevNode.collapsed) {
                  parent.children.splice(idx,1);
                  prevNode.children.push(node);
                  setTimeout(() => { setFocusId(node.id); cursorGoalRef.current='start'; },0);
              } else {
                  const cursor = prevNode.text.length + (prevNode.text && node.text ? 1 : 0);
                  if(prevNode.text && node.text) prevNode.text += " ";
                  prevNode.text += node.text;
                  parent.children.splice(idx,1);
                  if(node.children && node.children.length) {
                      prevNode.children = [...prevNode.children, ...node.children];
                      prevNode.collapsed = false;
                  }
                  setTimeout(() => { setFocusId(prevNode.id); cursorGoalRef.current=cursor; },0);
              }
          } else if(parent.id !== viewRootId) {
              const gpRes = findRes(newTree, parent.id);
              if(gpRes && gpRes.parent) {
                  const pIdx = gpRes.parent.children.findIndex(c=>c.id===parent.id);
                  parent.children.splice(idx,1);
                  gpRes.parent.children.splice(pIdx+1, 0, node);
                  setTimeout(() => { setFocusId(id); cursorGoalRef.current='end'; },0);
              }
          }
          return newTree;
      });
  }, [viewRootId]);

  const runArrow = useCallback((e, id, dir) => {
      e.preventDefault();
      setTree(prev => updateNodeInTree(prev, id, n => ({...n, text: n.text.trim().replace(/\n{3,}/g, '\n\n')})));
      
      const visibleList = [];
      const traverse = (n) => {
          if(n.id !== viewRootId) visibleList.push(n.id);
          if(!n.collapsed && n.children) n.children.forEach(traverse);
      };
      const rootRes = findRes(tree, viewRootId);
      if(rootRes) traverse(rootRes.node);
      
      const idx = visibleList.indexOf(id);
      if(dir==='up' && idx > 0) { setFocusId(visibleList[idx-1]); cursorGoalRef.current='end'; }
      if(dir==='down' && idx < visibleList.length-1) { setFocusId(visibleList[idx+1]); cursorGoalRef.current='start'; }
      if(dir==='up' && idx===0) { setFocusId(viewRootId); cursorGoalRef.current='end'; }
  }, [tree, viewRootId]);

  const runMoveNode = useCallback((e, id, dir) => {
      e.preventDefault();
      skipBlurRef.current = true;
      setTree(prev => {
          const newTree = JSON.parse(JSON.stringify(prev));
          const res = findRes(newTree, id);
          if(!res || !res.parent) return prev;
          const {node, parent} = res;
          const idx = parent.children.findIndex(c=>c.id===id);
          
          if(dir==='up') {
              if(idx > 0) {
                  const prev = parent.children[idx-1];
                  if(!prev.collapsed && prev.children && prev.children.length > 0) {
                      parent.children.splice(idx,1);
                      prev.children.push(node);
                  } else {
                      parent.children[idx] = prev;
                      parent.children[idx-1] = node;
                  }
              } else if(parent.id !== viewRootId) {
                  const gpRes = findRes(newTree, parent.id);
                  if(gpRes && gpRes.parent) {
                      const pIdx = gpRes.parent.children.findIndex(c=>c.id===parent.id);
                      parent.children.splice(idx,1);
                      gpRes.parent.children.splice(pIdx, 0, node);
                  }
              }
          } else { 
              if(idx < parent.children.length-1) {
                  const next = parent.children[idx+1];
                  if(!next.collapsed && next.children && next.children.length > 0) {
                      parent.children.splice(idx,1);
                      next.children.unshift(node);
                  } else {
                      parent.children[idx] = next;
                      parent.children[idx+1] = node;
                  }
              } else if(parent.id !== viewRootId) {
                  const gpRes = findRes(newTree, parent.id);
                  if(gpRes && gpRes.parent) {
                      const pIdx = gpRes.parent.children.findIndex(c=>c.id===parent.id);
                      parent.children.splice(idx,1);
                      gpRes.parent.children.splice(pIdx+1, 0, node);
                  }
              }
          }
          setTimeout(() => { setFocusId(id); }, 0);
          return newTree;
      });
  }, [viewRootId]);

  const runTab = useCallback((e, id) => {
      e.preventDefault();
      skipBlurRef.current = true;
      setTree(prev => {
          const newTree = JSON.parse(JSON.stringify(prev));
          const res = findRes(newTree, id);
          if(!res || !res.parent) return prev;
          const {node, parent} = res;
          const idx = parent.children.findIndex(c=>c.id===id);
          if(idx === 0) return prev;
          const prev = parent.children[idx-1];
          parent.children.splice(idx,1);
          if(!prev.children) prev.children = [];
          prev.children.push(node);
          prev.collapsed = false;
          setTimeout(() => { setFocusId(id); cursorGoalRef.current='end'; }, 0);
          return newTree;
      });
  }, []);

  const runShiftTab = useCallback((e, id) => {
      e.preventDefault();
      skipBlurRef.current = true;
      setTree(prev => {
          const newTree = JSON.parse(JSON.stringify(prev));
          const res = findRes(newTree, id);
          if(!res || !res.parent || parent.id === viewRootId) return prev;
          const {node, parent} = res;
          const gpRes = findRes(newTree, parent.id);
          if(!gpRes || !gpRes.parent) return prev;
          const idx = parent.children.findIndex(c=>c.id===id);
          const pIdx = gpRes.parent.children.findIndex(c=>c.id===parent.id);
          parent.children.splice(idx,1);
          gpRes.parent.children.splice(pIdx+1, 0, node);
          setTimeout(() => { setFocusId(id); cursorGoalRef.current='end'; }, 0);
          return newTree;
      });
  }, [viewRootId]);

  const handleBlur = useCallback((id) => {
    if (skipBlurRef.current) { skipBlurRef.current = false; return; }
    setTree(prev => {
        const newTree = JSON.parse(JSON.stringify(prev));
        const res = findRes(newTree, id);
        if(!res || !res.node) return prev;
        const { node, parent } = res;
        
        let text = node.text.trim().replace(/\n{3,}/g, '\n\n');
        if(text === node.text && (!parent || node.text.length > 0)) return prev; 

        node.text = text;
        
        if(parent && text === '' && (!node.children || node.children.length === 0)) {
             const idx = parent.children.findIndex(c => c.id === id);
             if(idx !== -1) parent.children.splice(idx, 1);
        } else if (parent) {
             const idx = parent.children.findIndex(c => c.id === id);
             if (idx > 0) {
                 const prevNode = parent.children[idx - 1];
                 if (prevNode.text.trim() === '' && (!prevNode.children || prevNode.children.length === 0)) {
                     parent.children.splice(idx - 1, 1);
                 }
             }
        }
        return newTree;
    });
  }, []);

  const handlePaste = useCallback((e, id) => {
    const pasted = e.clipboardData.getData('Text');
    if (!pasted.includes('\n')) return;
    e.preventDefault();
    skipBlurRef.current = true;
    const nodes = parseTextToNodes(pasted);
    if (!nodes.length) return;
    setTree(prev => {
        const newTree = JSON.parse(JSON.stringify(prev));
        const res = findRes(newTree, id);
        if(!res || !res.parent) return prev;
        const {parent} = res;
        const idx = parent.children.findIndex(c=>c.id===id);
        parent.children.splice(idx+1, 0, ...nodes);
        return newTree;
    });
  }, []);

  const handleDrop = useCallback((e, targetId) => {
      e.preventDefault();
      if(!draggedId || draggedId === targetId) return;
      setTree(prev => {
          const newTree = JSON.parse(JSON.stringify(prev));
          let curr = findRes(newTree, targetId);
          while(curr && curr.parent) {
              if(curr.parent.id === draggedId) return prev;
              curr = findRes(newTree, curr.parent.id);
          }
          
          const src = findRes(newTree, draggedId);
          const tgt = findRes(newTree, targetId);
          if(!src || !tgt) return prev;
          
          const sIdx = src.parent.children.findIndex(c=>c.id===draggedId);
          src.parent.children.splice(sIdx,1);
          
          const tIdx = tgt.parent.children.findIndex(c=>c.id===targetId);
          tgt.parent.children.splice(tIdx, 0, src.node);
          return newTree;
      });
      setDraggedId(null);
  }, [draggedId]);

  const handleNodeKeyDown = useCallback((e, node) => {
      if (e.key === 'Enter' && !e.shiftKey) runEnter(e, node.id);
      if (e.key === 'Backspace') runBackspace(e, node.id);
      if (e.key === 'Tab') {
          if (e.shiftKey) runShiftTab(e, node.id);
          else runTab(e, node.id);
      }
      if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.altKey) runArrow(e, node.id, 'up');
      if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.altKey) runArrow(e, node.id, 'down');
      
      if (e.altKey && !e.shiftKey && e.key === 'ArrowDown') handleToggleCollapse(e, node.id);
      if (e.altKey && !e.shiftKey && e.key === 'ArrowUp') handleToggleCollapse(e, node.id);
      
      if (e.shiftKey && e.key === 'ArrowUp' && !e.altKey) runMoveNode(e, node.id, 'up');
      if (e.shiftKey && e.key === 'ArrowDown' && !e.altKey) runMoveNode(e, node.id, 'down');
      
      if (e.altKey && e.shiftKey && e.key === 'ArrowRight') handleZoom(node.id);
      if (e.altKey && e.shiftKey && e.key === 'ArrowLeft') handleZoomOut();
  }, [runEnter, runBackspace, runTab, runShiftTab, runArrow, handleToggleCollapse, runMoveNode, handleZoom, handleZoomOut]);

  const handlers = useMemo(() => ({
    onUpdateText: handleUpdateText,
    onToggleCollapse: handleToggleCollapse,
    onKeyDown: handleNodeKeyDown,
    onFocus: (id) => setFocusId(id),
    onBlur: handleBlur,
    onPaste: handlePaste,
    onZoom: handleZoom,
    onDragStart: (e, id) => { setDraggedId(id); skipBlurRef.current=true; },
    onDragEnd: (e) => setDraggedId(null),
    onDrop: handleDrop,
    focusedId: focusId, 
    matchIds,
    matchIndex: currentMatchIndex
  }), [handleUpdateText, handleToggleCollapse, handleNodeKeyDown, handleBlur, handlePaste, handleZoom, handleDrop, focusId, matchIds, currentMatchIndex]);

  useEffect(() => {
    if (focusId) {
      setTimeout(() => {
        const el = document.getElementById(`input-${focusId}`);
        if (el) {
           el.focus();
           if (typeof cursorGoalRef.current === 'number') el.setSelectionRange(cursorGoalRef.current, cursorGoalRef.current);
           else if (cursorGoalRef.current === 'start') el.setSelectionRange(0, 0);
           else if (cursorGoalRef.current === 'end') el.setSelectionRange(el.value.length, el.value.length);
           cursorGoalRef.current = null;
           
           const rect = el.getBoundingClientRect();
           if (rect.top < 0 || rect.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
           document.getElementById(`input-${viewRootId}`)?.focus();
        }
      }, 0);
    }
  }, [focusId, focusTrigger, viewRootId]);

  const handleGlobalKeyDown = useCallback((e) => {
      if (e.ctrlKey && e.key === '/') { e.preventDefault(); searchInputRef.current?.focus(); }
      if (e.altKey && e.key === '/') { e.preventDefault(); setShowHelp(p => !p); }
      if (e.key === 'Escape') { setShowHelp(false); setShowExport(false); }
      if (e.altKey && e.key === 'h') { e.preventDefault(); handleGoHome(); }
      if (e.altKey && e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); handleZoomOut(); }
      
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        const activeTag = document.activeElement.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
           e.preventDefault();
           if (lastFocusRef.current) {
             const exists = findRes(tree, lastFocusRef.current);
             if (exists) { setFocusId(lastFocusRef.current); cursorGoalRef.current = 'end'; return; }
           }
           handleAddFirstChild();
        }
      }
  }, [handleGoHome, handleZoomOut, handleAddFirstChild, tree]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  const viewResult = findRes(tree, viewRootId);
  const currentViewNode = viewResult ? viewResult.node : tree;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: theme.bg, color: theme.fg, fontFamily: 'sans-serif', padding: '40px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
           <h1 style={{ cursor: 'pointer', margin:0 }} onClick={handleGoHome}>Workflowy v13.37</h1>
           <div style={{ display: 'flex', gap: '10px' }}>
             <button onClick={() => setShowExport(true)}>Export</button>
             <button onClick={() => setDarkMode(!darkMode)}>{darkMode ? '☀️' : '🌙'}</button>
             <button onClick={() => setShowHelp(true)}>Help</button>
           </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
            <input 
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search..."
              style={{ width: '100%', padding: '8px', background: theme.inputBg, color: theme.fg, border: `1px solid ${theme.border}` }}
            />
        </div>

        <div style={{ marginBottom: '20px', color: theme.dim }}>
           {viewRootId !== 'root' && <span style={{cursor:'pointer', textDecoration:'underline'}} onClick={handleZoomOut}>&lt; Back to Parent</span>}
        </div>

        <div style={{ fontSize: '2em', fontWeight: 'bold', marginBottom: '10px' }}>
            {viewRootId === 'root' ? 'Home' : (
                <textarea 
                    value={currentViewNode.text}
                    onChange={e => handleUpdateText(currentViewNode.id, e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: theme.fg, width: '100%', resize: 'none', fontSize: 'inherit', fontWeight: 'inherit', fontFamily: 'inherit' }}
                />
            )}
        </div>

        <div>
           {currentViewNode.children && currentViewNode.children.map(child => (
             <NodeItem 
               key={child.id} 
               node={child} 
               isFocused={child.id === focusId}
               isMatch={matchIds.includes(child.id)}
               isSelectedMatch={matchIds[currentMatchIndex] === child.id}
               searchQuery={searchQuery}
               theme={theme}
               handlers={handlers}
             />
           ))}
           {(!currentViewNode.children || currentViewNode.children.length === 0) && (
               <div style={{ padding: '20px', color: theme.dim, cursor: 'pointer' }} onClick={handleAddFirstChild}>
                   Click here to start typing...
               </div>
           )}
        </div>

        {showExport && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowExport(false)}>
            <div style={{ background: theme.panel, padding: '20px', borderRadius: '8px', width: '600px', height: '400px', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                <textarea readOnly value={treeToString(tree)} style={{ flex: 1, marginBottom: '10px', background: theme.inputBg, color: theme.fg }} />
                <button onClick={() => setShowExport(false)}>Close</button>
            </div>
          </div>
        )}
        
        {showHelp && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowHelp(false)}>
                <div style={{ background: theme.panel, padding: '20px', borderRadius: '8px', color: theme.fg }} onClick={e=>e.stopPropagation()}>
                    <h3>Shortcuts</h3>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        <li>Enter / Backspace: Add / Delete</li>
                        <li>Tab / Shift+Tab: Indent / Unindent</li>
                        <li>Shift + Up/Down: Move Node</li>
                        <li>Alt + Right / Left: Zoom In / Out</li>
                        <li>Alt + Up/Down: Collapse / Expand</li>
                    </ul>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}