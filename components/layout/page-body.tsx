import type { ElementType, ReactNode } from "react";

type PageBodySize = "wide" | "reading";

const SIZE_CLASS_MAP: Record<PageBodySize, string> = {
  wide: "max-w-[1500px]",
  reading: "max-w-5xl",
};

type PageBodyProps<T extends ElementType> = {
  as?: T;
  size?: PageBodySize;
  className?: string;
  children: ReactNode;
};

function stripConflictingLayoutClasses(className: string) {
  return className
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      if (
        token === "container" ||
        token === "mx-auto" ||
        token === "w-full" ||
        token.startsWith("max-w-")
      ) {
        return false;
      }

      const normalized = token.includes(":") ? token.split(":").pop() || token : token;
      return !/^px-\S+$/.test(normalized) && !/^pl-\S+$/.test(normalized) && !/^pr-\S+$/.test(normalized);
    })
    .join(" ");
}

export function PageBody<T extends ElementType = "main">({
  as,
  size = "wide",
  className = "",
  children,
}: PageBodyProps<T>) {
  const Component = (as || "main") as ElementType;
  const sanitizedClassName = stripConflictingLayoutClasses(className);
  const classes = [
    "mx-auto w-full min-w-0 px-3",
    SIZE_CLASS_MAP[size],
    sanitizedClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return <Component data-page-body={size} className={classes}>{children}</Component>;
}
