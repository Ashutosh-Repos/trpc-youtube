"use client";

import React, { useState, useRef, useEffect, useMemo, memo } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
    Loader2,
    ThumbsUp,
    ThumbsDown,
    MoreVertical,
    Trash2,
    Heart,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { inferRouterOutputs } from "@trpc/server";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { trpc } from "@/lib/trpc";
import { authClient } from "@/lib/auth/auth-client";
import { getMediaUrl, cn } from "@/lib/utils";
import type { AppRouter } from "@youtube/server/src/trpc/router";

// --- Types ---
type RouterOutputs = inferRouterOutputs<AppRouter>;
type Comment = RouterOutputs["comment"]["list"]["items"][number];

// --- Sub-components (Skeletons) ---
export const CommentSkeleton = memo(() => (
    <div className="flex gap-4 w-full">
        <Skeleton className="h-10 w-10 rounded-full shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-full max-w-[80%]" />
                <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex gap-2 mt-1">
                <Skeleton className="h-8 w-16 rounded-full" />
                <Skeleton className="h-8 w-16 rounded-full" />
                <Skeleton className="h-8 w-16 rounded-full" />
            </div>
        </div>
    </div>
));
CommentSkeleton.displayName = "CommentSkeleton";

export const CommentListSkeleton = memo(() => (
    <div className="flex flex-col gap-6">
        {Array.from({ length: 5 }).map((_: any, i: number) => (
            <CommentSkeleton key={i} />
        ))}
    </div>
));
CommentListSkeleton.displayName = "CommentListSkeleton";

// --- Hooks ---
function useCommentInteractions(comment: Comment, videoId: string) {
    const utils = trpc.useUtils();

    // Optimistic Update helper for infinite data
    const updateInfiniteData = (type: "LIKE" | "DISLIKE" | "REMOVE") => {
        // Optimistically update the single comment query (e.g. Highlighted Comment)
        utils.comment.getById.setData({ id: comment.id }, (oldComment: any) => {
            if (!oldComment) return oldComment;
            let newLikeCount = oldComment.likeCount;
            if (type === "LIKE" && oldComment.userReaction !== "LIKE")
                newLikeCount++;
            if (oldComment.userReaction === "LIKE" && type !== "LIKE")
                newLikeCount--;

            return {
                ...oldComment,
                likeCount: Math.max(0, newLikeCount),
                userReaction:
                    type === "REMOVE" ? null : (type as "LIKE" | "DISLIKE"),
            };
        });

        // Optimistically update both TOP and NEWEST list queries
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateList = (oldData: any) => {
            if (!oldData) return oldData;
            return {
                ...oldData,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                pages: oldData.pages.map((page: any) => ({
                    ...page,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    items: page.items.map((item: any) => {
                        if (item.id !== comment.id) return item;

                        let newLikeCount = item.likeCount;
                        if (type === "LIKE" && item.userReaction !== "LIKE")
                            newLikeCount++;
                        if (item.userReaction === "LIKE" && type !== "LIKE")
                            newLikeCount--;

                        return {
                            ...item,
                            likeCount: Math.max(0, newLikeCount),
                            userReaction:
                                type === "REMOVE"
                                    ? null
                                    : (type as "LIKE" | "DISLIKE"),
                        };
                    }),
                })),
            };
        };

        utils.comment.list.setInfiniteData(
            { videoId, limit: 20, sortBy: "TOP" },
            updateList,
        );
        utils.comment.list.setInfiniteData(
            { videoId, limit: 20, sortBy: "NEWEST" },
            updateList,
        );
    };

    const toggleLike = trpc.comment.toggleLike.useMutation({
        onMutate: () => {
            const newType = comment.userReaction === "LIKE" ? "REMOVE" : "LIKE";
            updateInfiniteData(newType);
        },
        onError: () => {
            utils.comment.list.invalidate({ videoId });
            utils.comment.getById.invalidate({ id: comment.id });
        },
    });

    const toggleDislike = trpc.comment.toggleDislike.useMutation({
        onMutate: () => {
            const newType =
                comment.userReaction === "DISLIKE" ? "REMOVE" : "DISLIKE";
            updateInfiniteData(newType);
        },
        onError: () => {
            utils.comment.list.invalidate({ videoId });
            utils.comment.getById.invalidate({ id: comment.id });
        },
    });

    const deleteCommentMutation = trpc.comment.delete.useMutation({
        onSuccess: () => {
            utils.comment.list.invalidate({ videoId });
            utils.comment.getById.invalidate({ id: comment.id });
        },
    });

    return {
        toggleLike: () => toggleLike.mutate({ commentId: comment.id, videoId }),
        toggleDislike: () =>
            toggleDislike.mutate({ commentId: comment.id, videoId }),
        deleteComment: () =>
            deleteCommentMutation.mutate({ commentId: comment.id }),
        isDeleting: deleteCommentMutation.isPending,
    };
}

// --- Components ---

interface CommentInputProps {
    videoId: string;
    parentId?: string;
    onCancel?: () => void;
    onSuccess?: () => void;
    isReply?: boolean;
    autoFocus?: boolean;
}

export const CommentInput = memo(
    ({
        videoId,
        parentId,
        onCancel,
        onSuccess,
        isReply = false,
        autoFocus = false,
    }: CommentInputProps) => {
        const [content, setContent] = useState("");
        const [isFocused, setIsFocused] = useState(autoFocus);
        const { data: session } = authClient.useSession();
        const user = session?.user;
        const textareaRef = useRef<HTMLTextAreaElement>(null);

        const utils = trpc.useUtils();
        const createComment = trpc.comment.create.useMutation({
            onSuccess: () => {
                setContent("");
                setIsFocused(false);
                onSuccess?.();
                if (parentId) {
                    utils.comment.replies.invalidate({ parentId });
                } else {
                    utils.comment.list.invalidate({ videoId });
                }
            },
        });

        const handleSubmit = () => {
            if (!content.trim()) return;
            createComment.mutate({ videoId, content, parentId });
        };

        if (!user) return null;

        const showActions = isFocused || content.length > 0 || isReply;

        return (
            <div
                className={cn(
                    "flex gap-4 w-full transition-all",
                    isReply ? "mt-4" : "mb-6",
                )}
            >
                <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={getMediaUrl(user.image)} />
                    <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 flex flex-col gap-2">
                    <Textarea
                        ref={textareaRef}
                        autoFocus={autoFocus}
                        placeholder={
                            isReply ? "Add a reply..." : "Add a comment..."
                        }
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        className={cn(
                            "min-h-[44px] bg-surface-2/40 border-border/10 rounded-2xl focus-visible:ring-1 focus-visible:ring-primary/20 px-4 py-3 resize-none transition-all placeholder:text-[11px] placeholder:font-black placeholder:uppercase placeholder:tracking-widest placeholder:text-muted-foreground/40",
                            "focus-visible:bg-surface-2 placeholder:text-muted-foreground/70",
                        )}
                        rows={isFocused || content.length > 0 ? 3 : 1}
                    />
                    {showActions && (
                        <div className="flex justify-end gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setContent("");
                                    setIsFocused(false);
                                    onCancel?.();
                                }}
                                className="rounded-full"
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSubmit}
                                disabled={
                                    !content.trim() || createComment.isPending
                                }
                                className="rounded-full px-4"
                            >
                                {createComment.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {isReply ? "Reply" : "Comment"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    },
);
CommentInput.displayName = "CommentInput";

interface CommentRepliesProps {
    parentId: string;
    videoId: string;
}

const CommentReplies = memo(({ parentId, videoId }: CommentRepliesProps) => {
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
        trpc.comment.replies.useInfiniteQuery(
            { parentId, limit: 10 },
            { getNextPageParam: (lastPage) => lastPage.nextCursor },
        );

    const replies = data?.pages.flatMap((page) => page.items) || [];

    if (isLoading)
        return <Loader2 className="h-4 w-4 animate-spin mx-auto mt-4" />;

    return (
        <div className="flex flex-col gap-4 mt-2">
            {replies.map((reply: any) => (
                <CommentItem key={reply.id} comment={reply} videoId={videoId} />
            ))}
            {hasNextPage && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-[11px] font-black uppercase tracking-widest text-primary hover:text-primary/80 hover:bg-primary/10 px-4 rounded-full w-fit h-auto"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                >
                    {isFetchingNextPage ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-2" />
                    ) : (
                        "Show more replies"
                    )}
                </Button>
            )}
        </div>
    );
});
CommentReplies.displayName = "CommentReplies";

interface CommentItemProps {
    comment: Comment;
    videoId: string;
}

export const CommentItem = memo(({ comment, videoId }: CommentItemProps) => {
    const [isReplying, setIsReplying] = useState(false);
    const [showReplies, setShowReplies] = useState(false);
    const { data: session } = authClient.useSession();

    const { toggleLike, toggleDislike, deleteComment, isDeleting } =
        useCommentInteractions(comment, videoId);

    const isOwner = session?.user?.id === comment.userId;
    const authorChannel = comment.user.channels[0];

    return (
        <div className="flex gap-4 w-full group">
            <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={getMediaUrl(comment.user.image)} />
                <AvatarFallback>{comment.user.name?.[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 flex flex-col gap-1 min-w-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="font-black text-foreground/90 tracking-tight hover:text-primary cursor-pointer transition-colors">
                            {authorChannel
                                ? `@${authorChannel.handle}`
                                : comment.user.name}
                        </span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/30">
                            {formatDistanceToNow(new Date(comment.createdAt), {
                                addSuffix: true,
                            })}
                        </span>
                        {comment.isEdited && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/20">
                                (edited)
                            </span>
                        )}
                    </div>
                    {isOwner && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    className="text-destructive gap-2"
                                    onClick={() => deleteComment()}
                                    disabled={isDeleting}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
                <p className="text-sm whitespace-pre-wrap overflow-wrap-anywhere">
                    {comment.content}
                </p>

                <div className="flex items-center gap-1 mt-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-8 w-8 rounded-full",
                            comment.userReaction === "LIKE" && "text-blue-400",
                        )}
                        onClick={toggleLike}
                    >
                        <ThumbsUp
                            className={cn(
                                "h-4 w-4",
                                comment.userReaction === "LIKE" &&
                                    "fill-current",
                            )}
                        />
                    </Button>
                    <span className="text-xs text-muted-foreground mr-2">
                        {comment.likeCount > 0 && comment.likeCount}
                    </span>

                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-8 w-8 rounded-full",
                            comment.userReaction === "DISLIKE" &&
                                "text-destructive",
                        )}
                        onClick={toggleDislike}
                    >
                        <ThumbsDown
                            className={cn(
                                "h-4 w-4",
                                comment.userReaction === "DISLIKE" &&
                                    "fill-current",
                            )}
                        />
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full h-8 text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 hover:text-foreground hover:bg-surface-2 ml-2"
                        onClick={() => setIsReplying(!isReplying)}
                    >
                        Reply
                    </Button>
                </div>

                {isReplying && (
                    <CommentInput
                        videoId={videoId}
                        parentId={comment.parentId || comment.id}
                        autoFocus
                        isReply
                        onCancel={() => setIsReplying(false)}
                        onSuccess={() => {
                            setIsReplying(false);
                            setShowReplies(true);
                        }}
                    />
                )}

                {comment.replyCount > 0 && !comment.parentId && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] font-black uppercase tracking-widest text-primary hover:text-primary/80 hover:bg-primary/10 px-4 rounded-full w-fit h-auto mt-2"
                        onClick={() => setShowReplies(!showReplies)}
                    >
                        {showReplies
                            ? "Hide replies"
                            : `Show ${comment.replyCount} replies`}
                    </Button>
                )}

                {showReplies && !comment.parentId && (
                    <CommentReplies parentId={comment.id} videoId={videoId} />
                )}
            </div>
        </div>
    );
});
CommentItem.displayName = "CommentItem";

// --- Main Export ---
interface CommentSectionProps {
    videoId: string;
    scrollRef?: React.RefObject<HTMLElement | null>;
}

export function CommentSectionInner({
    videoId,
    scrollRef,
}: CommentSectionProps) {
    // If no external ref is provided, we might fallback to window or null.
    // We'll track an internal parentRef just in case we need a fallback, but trust scrollRef.
    const internalScrollRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        internalScrollRef.current = document.getElementById(
            "main-scroll-container",
        );
    }, []);

    // Resolve which ref to use
    const resolvedScrollRef = scrollRef || internalScrollRef;

    const containerRef = useRef<HTMLDivElement>(null);
    const [offsetTop, setOffsetTop] = useState(0);

    const searchParams = useSearchParams();
    const lc = searchParams.get("lc");

    const { data: highlightedComment, isLoading: isLoadingHighlighted } =
        trpc.comment.getById.useQuery({ id: lc || "" }, { enabled: !!lc });

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
        trpc.comment.list.useInfiniteQuery(
            { videoId, limit: 20, sortBy: "TOP" },
            { getNextPageParam: (lastPage) => lastPage.nextCursor },
        );

    const allComments = useMemo(() => {
        const items = data?.pages.flatMap((page) => page.items) || [];
        // Prevent duplication if the highlighted comment is also in the fetched pages
        if (lc) {
            return items.filter((item: any) => item.id !== lc);
        }
        return items;
    }, [data, lc]);

    // Measure offsets manually based on whichever scroll element is active
    useEffect(() => {
        const scrollElement = resolvedScrollRef.current;

        const measure = () => {
            if (containerRef.current && scrollElement) {
                const scrollRect = scrollElement.getBoundingClientRect();
                const containerRect =
                    containerRef.current.getBoundingClientRect();
                const offset =
                    containerRect.top -
                    scrollRect.top +
                    scrollElement.scrollTop;
                setOffsetTop((prev) =>
                    Math.abs(offset - prev) > 1 ? offset : prev,
                );
            }
        };

        measure();
        const timer = setTimeout(measure, 500);
        window.addEventListener("resize", measure);
        return () => {
            window.removeEventListener("resize", measure);
            clearTimeout(timer);
        };
    }, [allComments.length, isLoading, resolvedScrollRef.current]);

    const rowVirtualizer = useVirtualizer({
        count: allComments.length,
        getScrollElement: () => resolvedScrollRef.current,
        estimateSize: () => 100,
        overscan: 5,
        scrollMargin: offsetTop,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();
    const lastVirtualIndex =
        virtualItems.length > 0
            ? virtualItems[virtualItems.length - 1].index
            : -1;

    useEffect(() => {
        if (
            lastVirtualIndex >= allComments.length - 1 &&
            hasNextPage &&
            !isFetchingNextPage
        ) {
            fetchNextPage();
        }
    }, [
        hasNextPage,
        fetchNextPage,
        allComments.length,
        isFetchingNextPage,
        lastVirtualIndex,
    ]);

    if (isLoading && allComments.length === 0) return <CommentListSkeleton />;

    return (
        <div className="w-full max-w-[1280px] mx-auto mt-12">
            <h3 className="text-2xl font-black mb-8 tracking-tighter uppercase text-foreground/90">
                Comments
            </h3>
            <CommentInput videoId={videoId} />

            {/* Highlighted Linked Comment */}
            {lc && isLoadingHighlighted && (
                <div className="mt-6 mb-6">
                    <CommentSkeleton />
                </div>
            )}
            {lc && highlightedComment && (
                <div className="mt-8 mb-8 p-6 rounded-3xl border border-primary/20 bg-primary/5 shadow-[0_0_30px_-10px_oklch(var(--primary)/0.1)]">
                    <div className="text-[10px] font-black text-primary mb-6 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span>Highlighted Comment</span>
                    </div>
                    <CommentItem
                        comment={highlightedComment}
                        videoId={videoId}
                    />
                </div>
            )}

            <div className="flex flex-col gap-6 mt-6">
                <div
                    ref={containerRef}
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: "100%",
                        position: "relative",
                    }}
                >
                    {virtualItems.map((virtualRow: any) => {
                        const comment = allComments[virtualRow.index];
                        if (!comment) return null;
                        return (
                            <div
                                key={comment.id}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                className="absolute top-0 left-0 w-full pb-6"
                                style={{
                                    transform: `translateY(${virtualRow.start - offsetTop}px)`,
                                }}
                            >
                                <CommentItem
                                    comment={comment}
                                    videoId={videoId}
                                />
                            </div>
                        );
                    })}
                </div>
                {isFetchingNextPage && (
                    <div className="h-10 flex justify-center items-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}
            </div>
        </div>
    );
}

export function CommentSection(props: CommentSectionProps) {
    return (
        <React.Suspense fallback={<CommentListSkeleton />}>
            <CommentSectionInner {...props} />
        </React.Suspense>
    );
}
