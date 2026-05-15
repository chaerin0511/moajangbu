'use client';
import { MouseEvent, ReactNode } from 'react';

interface Props {
  message: string;
  className?: string;
  children: ReactNode;
  type?: 'submit' | 'button';
  formAction?: any; // optional: when used outside a parent <form>
}

/**
 * <form> 안의 submit button을 대체. confirm() 취소 시 submit을 막는다.
 * 서버 액션 변경 없이 form action 그대로 사용 가능.
 */
export default function ConfirmButton({ message, className, children, type = 'submit', formAction }: Props) {
  function onClick(e: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  return (
    <button type={type} className={className} onClick={onClick} formAction={formAction}>
      {children}
    </button>
  );
}
