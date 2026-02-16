"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface InlineEditProps {
    value: string | number | null;
    onSave: (value: string | number) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    type?: "text" | "number";
    suffix?: string;
    as?: "input" | "textarea";
    style?: React.CSSProperties; // style対応
}

export default function InlineEdit({
    value,
    onSave,
    placeholder = "-",
    className,
    inputClassName,
    type = "text",
    suffix = "",
    as = "input",
    style
}: InlineEditProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState<string | number>("");
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isEditing) {
            setEditValue(value ?? "");
            // Focus input when editing starts
            setTimeout(() => {
                inputRef.current?.focus();
            }, 0);
        }
    }, [isEditing, value]);

    const handleSave = () => {
        if (editValue !== value) {
            // Convert to number if type is number
            const finalValue = type === "number" && editValue !== ""
                ? Number(editValue)
                : editValue;
            onSave(finalValue);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            if (as === "input") { // textareaの場合はEnterで改行したい場合があるため
                e.preventDefault();
                handleSave();
            }
        } else if (e.key === "Escape") {
            setIsEditing(false);
            setEditValue(value ?? "");
        }
    };

    if (isEditing) {
        if (as === "textarea") {
            // 簡易的なtextarea対応（今回は使わないかもしれないが念のため）
            return (
                <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className={cn("w-full border rounded p-1", inputClassName)}
                    placeholder={placeholder}
                />
            );
        }

        return (
            <div className="flex items-center">
                <Input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type={type}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className={cn("h-auto py-1 px-2 m-0", inputClassName)}
                    placeholder={placeholder}
                    style={style}
                />
                {suffix && <span className="ml-1 text-sm text-gray-500">{suffix}</span>}
            </div>
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            className={cn(
                "cursor-pointer hover:bg-gray-100/50 rounded px-1 py-0.5 min-h-[1.5em] transition-colors flex items-center",
                !value && "text-gray-400 italic",
                className
            )}
            title="クリックして編集"
            style={style}
        >
            {value !== null && value !== "" ? (
                <>
                    {value}
                    {suffix && <span className="ml-1 text-sm text-gray-500">{suffix}</span>}
                </>
            ) : (
                placeholder
            )}
        </div>
    );
}
