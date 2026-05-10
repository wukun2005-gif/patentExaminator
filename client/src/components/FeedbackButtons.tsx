import { useState } from "react";
import type { FeedbackEntry } from "@shared/types/domain";

interface FeedbackButtonsProps {
  targetId: string;
  targetType: FeedbackEntry["targetType"];
  existingFeedback: FeedbackEntry | undefined;
  onSave: (feedback: FeedbackEntry) => void;
}

export function FeedbackButtons({
  targetId,
  targetType,
  existingFeedback,
  onSave
}: FeedbackButtonsProps) {
  const [sentiment, setSentiment] = useState<"like" | "dislike" | null>(
    existingFeedback?.sentiment ?? null
  );
  const [comment, setComment] = useState(existingFeedback?.comment ?? "");
  const [showComment, setShowComment] = useState(false);

  const handleSentiment = (newSentiment: "like" | "dislike") => {
    const finalSentiment = sentiment === newSentiment ? null : newSentiment;
    setSentiment(finalSentiment);

    onSave({
      id: existingFeedback?.id ?? `fb-${targetId}-${Date.now()}`,
      targetId,
      targetType,
      sentiment: finalSentiment,
      comment,
      createdAt: existingFeedback?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  };

  const handleCommentSave = () => {
    onSave({
      id: existingFeedback?.id ?? `fb-${targetId}-${Date.now()}`,
      targetId,
      targetType,
      sentiment,
      comment,
      createdAt: existingFeedback?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setShowComment(false);
  };

  return (
    <div className="feedback-buttons" data-testid={`feedback-${targetId}`}>
      <button
        type="button"
        className={`feedback-btn like ${sentiment === "like" ? "active" : ""}`}
        onClick={() => handleSentiment("like")}
        data-testid={`btn-like-${targetId}`}
        aria-label="赞同"
      >
        👍
      </button>
      <button
        type="button"
        className={`feedback-btn dislike ${sentiment === "dislike" ? "active" : ""}`}
        onClick={() => handleSentiment("dislike")}
        data-testid={`btn-dislike-${targetId}`}
        aria-label="反对"
      >
        👎
      </button>
      <button
        type="button"
        className="feedback-btn comment"
        onClick={() => setShowComment(!showComment)}
        data-testid={`btn-comment-${targetId}`}
        aria-label="评论"
      >
        💬
      </button>

      {showComment && (
        <div className="comment-input" data-testid={`comment-input-${targetId}`}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="输入评论..."
            rows={2}
          />
          <button
            type="button"
            onClick={handleCommentSave}
            data-testid={`btn-save-comment-${targetId}`}
          >
            保存
          </button>
        </div>
      )}

      {comment && !showComment && (
        <div className="comment-display" data-testid={`comment-display-${targetId}`}>
          <span>{comment}</span>
        </div>
      )}
    </div>
  );
}
