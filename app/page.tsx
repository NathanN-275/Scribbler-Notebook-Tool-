import Link from "next/link";
import { BookOpen, CircleCheck, Eraser, FolderOpen, Lasso, Pencil, PenTool, Plus, Sparkles, Undo2 } from "lucide-react";
import { Brand } from "../components/brand";

const features = [
  { title: "Write it your way", text: "Draw with pen or pencil on plain, lined, graph, or dotted paper. Use a mouse or write right on your touchscreen.", Icon: Pencil },
  { title: "Keep your notes together", text: "Organize notes in folders, add pages as you go, and pick up where you left off in the same browser.", Icon: FolderOpen },
  { title: "Get help when you’re stuck", text: "A planned AI tutor will explain handwritten work, give hints, and help you practice.", Icon: Sparkles },
];

function NotebookPreview() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="preview-window">
        <div className="preview-top">
          <span><BookOpen size={16} /> Study notes</span>
          <Sparkles size={16} />
        </div>
        <div className="preview-toolbar">
          <span className="preview-active"><PenTool size={16} /></span>
          <Pencil size={16} /><Eraser size={16} /><Lasso size={16} />
          <div className="preview-divider" />
          <i className="ink-dot dark" /><i className="ink-dot blue" /><i className="ink-dot red" />
          <div className="preview-divider" /><Undo2 size={16} />
        </div>
        <div className="preview-desk">
          <div className="preview-paper">
            <span className="sample-label">CALCULUS · WEEK 03</span>
            <div className="sample-heading">Derivatives</div>
            <p>The slope at a point</p>
            <div className="sample-graph">
              <div className="sample-axis" /><span className="sample-curve" /><span className="sample-tangent" /><b />
            </div>
            <span className="sample-equation">f(x) = x² &nbsp; ⟶ &nbsp; f′(x) = 2x</span>
          </div>
        </div>
        <div className="preview-bottom"><span>Page 1 of 2</span><Plus size={14} /></div>
      </div>
      <div className="preview-save"><CircleCheck size={16} /> Saved in this browser</div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="site-width site-nav">
          <Brand />
          <nav aria-label="Main navigation">
            <Link className="text-link" href="#features">Features</Link>
            <Link className="button button-outline" href="/library">Open library</Link>
          </nav>
        </div>
      </header>
      <main className="site-width">
        <section className="hero">
          <div className="hero-copy">
            <h1>A notebook for the way you <em>think.</em></h1>
            <p>Take handwritten notes, sketch ideas, and work through problems on digital paper.</p>
            <Link className="button button-primary hero-cta" href="/library">Try the tool</Link>
            <div className="hero-detail"><CircleCheck size={16} /> Your notes save in this browser.</div>
          </div>
          <NotebookPreview />
        </section>
        <section className="features" id="features">
          <h2>Make it your study space.</h2>
          <div className="feature-grid">
            {features.map(({ title, text, Icon }) => (
              <article className="feature" key={title}>
                <span className="feature-icon"><Icon size={21} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="site-footer"><div className="site-width"><Brand /></div></footer>
    </>
  );
}
